import type { NodeDefinition } from 'schema';
import { renderScreen } from './screen-testing';

describe('griglia a colonne nel form', () => {
  const items = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('form > nz-form-item')];

  it('columns e span impostano la griglia; lo span non supera le colonne', async () => {
    const form: NodeDefinition = {
      type: 'form',
      columns: 3,
      fields: [
        { name: 'nome', type: 'text', label: 'Nome' },
        { name: 'cognome', type: 'text', label: 'Cognome' },
        { name: 'cap', type: 'text', label: 'CAP' },
        { name: 'indirizzo', type: 'text', label: 'Indirizzo', span: 2 },
        { name: 'note', type: 'textarea', label: 'Note', span: 4 },
      ],
    };
    const h = await renderScreen({ components: [form] });
    const element = h.el.querySelector('form') as HTMLElement;
    expect(element.classList.contains('grid')).toBe(true);
    expect(element.style.getPropertyValue('--lc-form-columns')).toBe('3');
    expect(items(h.el).map((i) => i.style.getPropertyValue('--lc-field-span'))).toEqual(['1', '1', '1', '2', '3']);
  });

  it('senza columns il form resta a una colonna, come prima', async () => {
    const h = await renderScreen({ components: [{ type: 'form', fields: [{ name: 'nome', type: 'text' }] }] });
    expect(h.el.querySelector('form')?.classList.contains('grid')).toBe(false);
  });
});
