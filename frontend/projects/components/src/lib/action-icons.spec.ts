import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';

describe('icons on buttons and actions', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));
  const iconOf = (el: Element | null): string | null => el?.querySelector('lc-icon .anticon')?.className.match(/anticon-([a-z-]+)/)?.[1] ?? null;

  it('the button and the actions of a form show their icon before the text, which stays', async () => {
    const button: NodeDefinition = { type: 'button', label: 'Save', icon: 'save', onClick: [{ toast: 'Saved' }] };
    const form: NodeDefinition = {
      type: 'form',
      fields: [{ name: 'title', type: 'text', label: 'Title' }],
      actions: [
        { label: 'Back', icon: 'back', onClick: [{ toast: 'Back' }] },
        { label: 'Send', onClick: [{ toast: 'Sent' }] },
      ],
    };
    const h = await renderScreen({ components: [button, form] });
    const own = h.el.querySelector('lc-button button');
    expect(iconOf(own)).toBe('save');
    expect(plain(own?.textContent)).toBe('Save');
    const actions = [...h.el.querySelectorAll('lc-form .actions button')];
    expect(actions.map((a) => iconOf(a))).toEqual(['arrow-left', null]);
    expect(actions.map((a) => plain(a.textContent))).toEqual(['Back', 'Send']);
  });

  it('bulk actions and row actions, as buttons and in the «⋯» menu, show their icon', async () => {
    const table: NodeDefinition = {
      type: 'table',
      source: 'data',
      selection: { bind: 'state.chosen' },
      columns: [{ field: 'number', label: 'Number' }],
      bulkActions: [{ label: 'Export', icon: 'download', onClick: [{ toast: 'Done' }] }],
      rowActionsInline: 1,
      rowActions: [
        { label: 'Edit', icon: 'edit', onClick: [{ toast: 'Edit' }] },
        { label: 'Delete', icon: 'delete', onClick: [{ toast: 'Deleted' }] },
      ],
    };
    const h = await renderScreen({
      components: [table],
      dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } },
      respond: () => [{ id: 1, number: 'F-1' }],
    });
    await h.until(() => !!h.el.querySelector('lc-row-actions button'), 'row actions');
    expect(iconOf(h.el.querySelector('.bulk button'))).toBe('download');
    const inline = h.el.querySelector('lc-row-actions .actions > span button');
    expect(iconOf(inline)).toBe('edit');
    expect(plain(inline?.textContent)).toBe('Edit');
    (h.el.querySelector('lc-row-actions button.more') as HTMLButtonElement).click();
    await h.until(() => !!document.querySelector('.ant-dropdown li.lc-row-action'), 'menu open');
    const item = document.querySelector('.ant-dropdown li.lc-row-action');
    expect(iconOf(item)).toBe('delete');
    expect(plain(item?.textContent)).toBe('Delete');
  });

  it('an unknown name shows no icon and keeps the text', async () => {
    const h = await renderScreen({ components: [{ type: 'button', label: 'Go', icon: 'nothing-like-this', onClick: [{ toast: 'Go' }] }] });
    const own = h.el.querySelector('lc-button button');
    expect(own?.querySelector('lc-icon .anticon')).toBeNull();
    expect(plain(own?.textContent)).toBe('Go');
  });
});
