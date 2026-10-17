import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('dialog with a form (dialog step)', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  const button: NodeDefinition = {
    type: 'button',
    label: 'Add note',
    onClick: [
      {
        dialog: {
          title: '<b>Note</b> for {{ 1 + 1 }}',
          fields: [{ name: 'text', type: 'textarea', label: 'Text', required: true }],
          initial: { text: '{{ state.old }}' },
          submitLabel: 'Save the note',
          onSubmit: [{ call: 'save' }],
        },
      },
      { toast: 'Done' },
    ],
  };
  const dataSources = { save: { type: 'rest' as const, method: 'POST' as const, url: '/api/note', body: '{{ form }}' } };
  const dialog = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('.lc-dialog-form .ant-modal')].at(-1) ?? null;
  const dialogButton = (text: string): HTMLButtonElement => [...dialog()!.querySelectorAll('button')].find((b) => plain(b.textContent) === text) as HTMLButtonElement;
  const open = async (h: ScreenHarness): Promise<void> => {
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Add note')) as HTMLButtonElement).click();
    await h.until(() => !!dialog()?.querySelector('lc-form textarea'), 'dialog open');
  };
  const modals = (): number => document.querySelectorAll('.lc-dialog-form .ant-modal').length;
  /** In jsdom the closed dialog stays in the document (the animation does not end): the test checks that another one can be opened. */
  const reopenable = async (h: ScreenHarness): Promise<void> => {
    const before = modals();
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Add note')) as HTMLButtonElement).click();
    await h.until(() => modals() === before + 1, 'new dialog');
  };

  it('shows the title as text and the form; validates, submits, closes and the sequence goes on', async () => {
    let fail = true;
    const h = await renderScreen({
      components: [button],
      dataSources,
      respond: () => {
        if (fail) throw new Error('500');
        return {};
      },
    });
    await open(h);
    expect(plain(dialog()!.querySelector('h2')?.textContent)).toBe('<b>Note</b> for 2');
    expect(dialog()!.querySelector('h2 b')).toBeNull();
    expect(dialog()!.closest('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(dialog()!.querySelector('h2')?.id);
    // Required and empty: no submission.
    dialogButton('Save the note').click();
    await h.settle();
    expect(h.requests).toEqual([]);
    const textarea = dialog()!.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Deliver by Friday';
    textarea.dispatchEvent(new Event('input'));
    // The service fails: the dialog stays open with the data.
    dialogButton('Save the note').click();
    await h.until(() => h.requests.length === 1, 'first submission');
    await h.settle();
    expect(dialog()?.querySelector('textarea')).not.toBeNull();
    expect(h.toasts).toEqual(['Operation failed']);
    fail = false;
    dialogButton('Save the note').click();
    await h.until(() => h.toasts.includes('Done'), 'sequence completed');
    expect(h.requests[1].body).toEqual({ text: 'Deliver by Friday' });
    await reopenable(h);
  });

  it('Cancel closes the dialog and stops the sequence', async () => {
    const h = await renderScreen({ components: [button], dataSources });
    await open(h);
    dialogButton('Cancel').click();
    await h.settle();
    expect(h.requests).toEqual([]);
    expect(h.toasts).toEqual([]);
    await reopenable(h);
  });
});
