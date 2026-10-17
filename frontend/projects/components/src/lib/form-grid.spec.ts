import type { NodeDefinition } from 'schema';
import { renderScreen } from './screen-testing';

describe('column grid in the form', () => {
  const items = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('form > nz-form-item')];

  it('columns and span set the grid; the span does not exceed the columns', async () => {
    const form: NodeDefinition = {
      type: 'form',
      columns: 3,
      fields: [
        { name: 'name', type: 'text', label: 'Name' },
        { name: 'surname', type: 'text', label: 'Surname' },
        { name: 'postcode', type: 'text', label: 'Postcode' },
        { name: 'address', type: 'text', label: 'Address', span: 2 },
        { name: 'note', type: 'textarea', label: 'Notes', span: 4 },
      ],
    };
    const h = await renderScreen({ components: [form] });
    const element = h.el.querySelector('form') as HTMLElement;
    expect(element.classList.contains('grid')).toBe(true);
    expect(element.style.getPropertyValue('--lc-form-columns')).toBe('3');
    expect(items(h.el).map((i) => i.style.getPropertyValue('--lc-field-span'))).toEqual(['1', '1', '1', '2', '3']);
  });

  it('without columns the form stays on one column, as before', async () => {
    const h = await renderScreen({ components: [{ type: 'form', fields: [{ name: 'name', type: 'text' }] }] });
    expect(h.el.querySelector('form')?.classList.contains('grid')).toBe(false);
  });
});
