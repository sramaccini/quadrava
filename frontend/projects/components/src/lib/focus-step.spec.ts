import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('the focus step', () => {
  const button = (h: ScreenHarness, label: string): HTMLButtonElement => [...h.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => plain(b.textContent) === label)!;
  const active = (): HTMLElement | null => document.activeElement as HTMLElement | null;
  const labelled = (h: ScreenHarness, label: string): HTMLElement =>
    [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;

  it('moves the focus to the first field of a component, shown by the step just before', async () => {
    const components: NodeDefinition[] = [
      { type: 'button', label: 'Link', onClick: [{ set: { path: 'state.linking', value: true } }, { focus: 'link-form' }, { toast: 'after' }] },
      { type: 'form', id: 'link-form', visibleIf: '{{ has(state.linking) && state.linking }}', fields: [{ name: 'target', type: 'text', label: 'Issue' }] },
    ];
    const h = await renderScreen({ components });
    button(h, 'Link').click();
    await h.until(() => h.toasts.includes('after'), 'the steps after it');
    await h.until(() => active() === labelled(h, 'Issue').querySelector('input'), 'focus in the first field');
    expect(h.reports).toEqual([]);
  });

  it('focuses the field named; in an inline form it opens its editor', async () => {
    const components: NodeDefinition[] = [
      { type: 'button', label: 'Edit', onClick: [{ focus: { component: 'content', field: 'description' } }] },
      {
        type: 'form',
        id: 'content',
        edit: 'inline',
        fields: [
          { name: 'summary', type: 'text', label: 'Summary' },
          { name: 'description', type: 'textarea', label: 'Description' },
        ],
        initial: { summary: 'Login', description: 'Fails' },
        onSave: [],
      },
    ];
    const h = await renderScreen({ components });
    await h.until(() => !!labelled(h, 'Description')?.querySelector('.view'), 'the value as text');
    button(h, 'Edit').click();
    await h.until(() => active() === labelled(h, 'Description').querySelector('textarea'), 'the editor open, with the focus');
    expect(labelled(h, 'Summary').querySelector('input')).toBeNull();
    expect(h.reports).toEqual([]);
  });

  it('on comments it goes to the writing box, not to the buttons of the thread; with no box it is reported', async () => {
    const thread = [{ author: 'Anna', text: 'First', date: '2026-10-01T09:00:00Z' }];
    const components: NodeDefinition[] = [
      { type: 'button', label: 'Comment', onClick: [{ focus: 'thread' }] },
      { type: 'button', label: 'Text', onClick: [{ focus: { component: 'thread', field: 'text' } }] },
      { type: 'button', label: 'Closed', onClick: [{ focus: 'closed' }, { toast: 'done' }] },
      { type: 'comments', id: 'thread', source: 'comments', onPost: [{ toast: 'posted' }], onEdit: [{ toast: 'edited' }] },
      { type: 'comments', id: 'closed', source: 'comments', onPost: [{ toast: 'posted' }], postIf: '{{ false }}', onEdit: [{ toast: 'edited' }] },
    ] as NodeDefinition[];
    const dataSources = { comments: { type: 'rest' as const, method: 'GET' as const, url: '/api/comments' } };
    const h = await renderScreen({ components, dataSources, respond: () => thread });
    const box = (): HTMLTextAreaElement => h.el.querySelector<HTMLTextAreaElement>('[data-node-id="thread"] textarea')!;
    await h.until(() => !!h.el.querySelector('[data-node-id="closed"] button') && !!box(), 'the thread and its box');
    button(h, 'Comment').click();
    await h.until(() => active() === box(), 'the focus in the box');
    (active() as HTMLElement).blur();
    button(h, 'Text').click();
    await h.until(() => active() === box(), 'the focus in the box, as its field');
    button(h, 'Closed').click();
    await h.until(() => h.toasts.includes('done'), 'the steps after it');
    expect(h.reports.map((r) => r.source)).toEqual(['focus closed']);
  });

  it('a component or a field not on the screen is reported, and the sequence goes on', async () => {
    const components: NodeDefinition[] = [
      { type: 'button', label: 'Go', onClick: [{ focus: 'nowhere' }, { focus: { component: 'f', field: 'missing' } }, { toast: 'done' }] },
      { type: 'form', id: 'f', fields: [{ name: 'a', type: 'text', label: 'A' }] },
    ];
    const h = await renderScreen({ components });
    button(h, 'Go').click();
    await h.until(() => h.toasts.includes('done'), 'the steps after it');
    expect(h.reports.map((r) => r.source)).toEqual(['focus nowhere', 'focus f']);
  });
});
