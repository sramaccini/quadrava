import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('panel with a form (popover step)', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const flag = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'button',
      label: 'Add flag',
      icon: 'flag',
      onClick: [
        { set: { path: 'state.flagged', value: true } },
        {
          popover: {
            title: '<b>Flag</b> added',
            icon: 'flag',
            tone: 'danger',
            fields: [{ name: 'comment', type: 'textarea', label: 'Why' }],
            submitLabel: 'Add comment',
            submitEnabledIf: "{{ isValid('required', form.comment) }}",
            onSubmit: [{ call: 'comment' }],
            ...extra,
          },
        },
        { toast: 'Done' },
      ],
    }) as NodeDefinition;
  const dataSources = { comment: { type: 'rest' as const, method: 'POST' as const, url: '/api/comments', body: '{{ form }}' } };
  const panel = (): HTMLElement | null => document.querySelector('.lc-popover-panel lc-form-popover');
  const trigger = (h: ScreenHarness): HTMLButtonElement => h.el.querySelector('lc-button button')!;
  const submit = (): HTMLButtonElement => [...panel()!.querySelectorAll('button')].find((b) => plain(b.textContent) === 'Add comment') as HTMLButtonElement;
  const open = async (h: ScreenHarness, when = 'panel open'): Promise<void> => {
    // After a panel closes the button stays busy until its sequence ends.
    await h.until(() => !trigger(h).disabled, `${when}: button enabled`);
    trigger(h).click();
    await h.until(() => !!panel()?.querySelector('textarea'), when);
    await h.settle();
  };
  const type = async (h: ScreenHarness, text: string): Promise<void> => {
    const textarea = panel()!.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    await h.settle();
  };

  it('opens under the button as a dialog named by its title (as text), with the focus on the first field', async () => {
    const h = await renderScreen({ components: [flag()], dataSources });
    await open(h);
    expect(panel()!.getAttribute('role')).toBe('dialog');
    const title = panel()!.querySelector('h2')!;
    expect(plain(title.textContent)).toBe('<b>Flag</b> added');
    expect(title.querySelector('b')).toBeNull();
    expect(panel()!.getAttribute('aria-labelledby')).toBe(title.id);
    expect(panel()!.querySelector('.head .anticon-flag')).not.toBeNull();
    await h.until(() => document.activeElement === panel()!.querySelector('textarea'), 'focus on the field');
    expect(panel()!.querySelector('button.close')?.getAttribute('aria-label')).toBe('Close');
    expect(h.reports).toEqual([]);
  });

  it('the button is disabled while the comment is empty; submitted, the panel closes, the sequence goes on, the focus goes back', async () => {
    const h = await renderScreen({ components: [flag()], dataSources, respond: () => ({}) });
    await open(h);
    expect(submit().disabled).toBe(true);
    await type(h, 'Blocked by the API');
    await h.until(() => !submit().disabled, 'enabled');
    submit().click();
    await h.until(() => h.toasts.includes('Done'), 'sequence completed');
    expect(h.requests[0].body).toEqual({ comment: 'Blocked by the API' });
    await h.until(() => panel() === null, 'closed');
    await h.until(() => document.activeElement === trigger(h), 'focus back on the button');
  });

  it('Esc, the cross and a click outside close it and stop the sequence; what ran before stays done', async () => {
    const h = await renderScreen({ components: [flag(), { type: 'text', text: 'flagged: {{ has(state.flagged) && state.flagged }}' }], dataSources });
    await open(h);
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await h.until(() => panel() === null, 'closed with Esc');
    expect(plain(h.el.textContent)).toContain('flagged: true');
    await h.settle();

    await open(h, 'open again after Esc');
    (panel()!.querySelector('button.close') as HTMLButtonElement).click();
    await h.until(() => panel() === null, 'closed with the cross');

    await open(h, 'open again after the cross');
    (document.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
    await h.until(() => panel() === null, 'closed with a click outside');
    expect(h.requests).toEqual([]);
    expect(h.toasts).toEqual([]);
  });
});
