import type { NodeDefinition } from 'schema';
import { localizeDialogClose } from './dialog-close';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

/** The accessible name of a checkbox: the text of its label, as a screen reader reads it. */
const nameOf = (input: HTMLInputElement): string => plain(input.closest('label')?.textContent);

describe('names and states for assistive technologies', () => {
  it('the selection checkboxes of a table are named by the row', async () => {
    const h = await renderScreen({
      components: [{ type: 'table', source: 'data', selection: { bind: 'state.chosen' }, columns: [{ field: 'number', label: 'Number' }] }],
      dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } },
      respond: () => [{ id: 1, number: 'F-1' }, { id: 2, number: 'F-2' }],
    });
    await h.until(() => h.el.querySelectorAll('tbody input[type="checkbox"]').length === 2, 'rows');
    const boxes = [...h.el.querySelectorAll<HTMLInputElement>('nz-table input[type="checkbox"]')];
    expect(boxes.map(nameOf)).toEqual(['Select all rows', 'Select F-1', 'Select F-2']);
  });

  it('the selection checkboxes of a serverDataTable are named by the row and by the visible rows', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'serverDataTable',
          source: 'search',
          selection: { bind: 'state.chosen' },
          columns: [{ field: 'key', label: 'Key' }],
        } as NodeDefinition,
      ],
      dataSources: { search: { type: 'rest', method: 'POST', url: '/api/search', body: '{{ request }}' } },
      respond: () => ({ items: [{ id: 7, key: 'WEB-1' }], total: 1 }),
    });
    await h.until(() => h.el.querySelectorAll('tbody input[type="checkbox"]').length === 1, 'rows');
    const boxes = [...h.el.querySelectorAll<HTMLInputElement>('lc-server-data-table input[type="checkbox"]')];
    expect(boxes.map(nameOf)).toEqual(['Select the visible rows', 'Select WEB-1']);
  });

  it('a required field says so, and an invalid field points to its message', async () => {
    const form: NodeDefinition = {
      type: 'form',
      fields: [
        { name: 'title', type: 'text', label: 'Title', required: true },
        { name: 'note', type: 'text', label: 'Note' },
      ],
      actions: [{ label: 'Save', onClick: [{ toast: 'Saved' }] }],
    };
    const h: ScreenHarness = await renderScreen({ components: [form] });
    const control = (label: string): HTMLElement => {
      const item = [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;
      return item.querySelector<HTMLElement>('input')!;
    };
    expect(control('Title').getAttribute('aria-required')).toBe('true');
    expect(control('Note').hasAttribute('aria-required')).toBe(false);
    expect(control('Title').hasAttribute('aria-describedby')).toBe(false);
    [...h.el.querySelectorAll<HTMLButtonElement>('lc-form .actions button')].find((b) => plain(b.textContent) === 'Save')!.click();
    await h.until(() => !!control('Title').getAttribute('aria-describedby'), 'message linked');
    const message = h.el.querySelector(`[id="${control('Title').getAttribute('aria-describedby')}"]`);
    expect(plain(message?.textContent)).toBe('Required field');
  });

  it('the close button of a dialog takes the name in the language of the user', async () => {
    const doc = document;
    let label = 'Chiudi';
    const observer = localizeDialogClose(doc, () => label)!;
    const button = doc.createElement('button');
    button.className = 'ant-modal-close';
    button.setAttribute('aria-label', 'Close');
    doc.body.appendChild(button);
    await new Promise((resolve) => setTimeout(resolve));
    expect(button.getAttribute('aria-label')).toBe('Chiudi');
    label = 'Close';
    const other = doc.createElement('button');
    other.className = 'ant-modal-close';
    doc.body.appendChild(other);
    await new Promise((resolve) => setTimeout(resolve));
    // A dialog that opens after the language changed takes the new name.
    expect([button, other].map((b) => b.getAttribute('aria-label'))).toEqual(['Chiudi', 'Close']);
    observer.disconnect();
    button.remove();
    other.remove();
  });
});
