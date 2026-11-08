import type { NodeDefinition } from 'schema';
import { renderScreen } from './screen-testing';

describe('column grid and flow in the form', () => {
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

  it('a field with width takes a size of the theme; without it the whole cell', async () => {
    const form: NodeDefinition = {
      type: 'form',
      fields: [
        { name: 'postcode', type: 'text', label: 'Postcode', width: 'xs' },
        { name: 'date', type: 'date', label: 'Date', width: 's' },
        { name: 'name', type: 'text', label: 'Name' },
      ],
    };
    const h = await renderScreen({ components: [form] });
    const controls = [...h.el.querySelectorAll<HTMLElement>('lc-field-control')];
    expect(controls.map((c) => c.classList.contains('sized'))).toEqual([true, true, false]);
    expect(controls[0].style.getPropertyValue('--lc-field-width')).toBe('var(--lc-field-width-xs, 6rem)');
    expect(controls[1].style.getPropertyValue('--lc-field-width')).toBe('var(--lc-field-width-s, 10rem)');
    expect(controls[2].style.getPropertyValue('--lc-field-width')).toBe('');
  });

  it('layout flow: no grid, the fields without width on a line of their own', async () => {
    const form: NodeDefinition = {
      type: 'form',
      layout: 'flow',
      columns: 3,
      fields: [
        { name: 'postcode', type: 'text', label: 'Postcode', width: 'xs' },
        { name: 'city', type: 'text', label: 'City', width: 'm' },
        { name: 'note', type: 'textarea', label: 'Notes' },
      ],
    };
    const h = await renderScreen({ components: [form] });
    const element = h.el.querySelector('form') as HTMLElement;
    expect(element.classList.contains('flow')).toBe(true);
    expect(element.classList.contains('grid')).toBe(false);
    expect(items(h.el).map((i) => i.classList.contains('line'))).toEqual([false, false, true]);
  });

  it('a filter with width keeps it, without the minimum width of the filters', async () => {
    const h = await renderScreen({
      components: [{ type: 'filterBar', bind: 'state.filters', fields: [{ name: 'code', type: 'text', label: 'Code', width: 'xs' }, { name: 'text', type: 'text', label: 'Text' }] }],
    });
    const controls = [...h.el.querySelectorAll<HTMLElement>('lc-filter-bar lc-field-control')];
    expect(controls.map((c) => c.classList.contains('sized'))).toEqual([true, false]);
  });
});
