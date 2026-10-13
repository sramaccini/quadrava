import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('campi a sé (input)', () => {
  /** Un testo che mostra lo stato, per leggere quello che il campo ha scritto. */
  const show = (expression: string): NodeDefinition => ({ id: 'mostra', type: 'text', text: `{{ ${expression} }}` });
  const shown = (el: HTMLElement): string => plain(el.querySelector('[data-node-id="mostra"]')?.textContent);
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string, event: 'input' | 'change'): void => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };

  it('il testo libero si scrive nello stato uscendo dal campo, non a ogni carattere', async () => {
    const h = await renderScreen({
      components: [{ type: 'input', field: { name: 'nome', type: 'text', label: 'Nome' } }, show("state.nome == null ? 'vuoto' : state.nome")],
    });
    expect(plain(h.el.querySelector('lc-input label')?.textContent)).toBe('Nome');
    expect(shown(h.el)).toBe('vuoto');
    const input = h.el.querySelector('lc-input input') as HTMLInputElement;
    type(input, 'Ann', 'input');
    await h.settle();
    expect(shown(h.el)).toBe('vuoto');
    type(input, 'Anna', 'change');
    await h.settle();
    expect(shown(h.el)).toBe('Anna');
    // Svuotato, torna nullo.
    type(input, '', 'change');
    await h.settle();
    expect(shown(h.el)).toBe('vuoto');
  });

  it('i data source che usano lo stato del campo si ricaricano quando cambia; i numeri arrivano come numeri', async () => {
    const h = await renderScreen({
      components: [{ type: 'input', bind: 'state.filtro.quantita', default: 3, field: { name: 'quantita', type: 'number', label: 'Quantità' } }],
      dataSources: { righe: { type: 'rest', method: 'GET', url: '/api/righe', params: { q: '{{ state.filtro.quantita }}' } } },
      respond: () => [],
    });
    // Il valore iniziale è nello stato prima del primo caricamento.
    await h.until(() => h.requests.length === 1, 'primo caricamento');
    expect(h.requests[0].query).toEqual({ q: 3 });
    expect((h.el.querySelector('lc-input input') as HTMLInputElement).value).toBe('3');
    type(h.el.querySelector('lc-input input') as HTMLInputElement, '12', 'change');
    await h.until(() => h.requests.length === 2, 'nuovo caricamento');
    expect(h.requests[1].query).toEqual({ q: 12 });
  });

  it('elenco a discesa: la scelta va nello stato con le etichette tradotte delle opzioni', async () => {
    const restore = stubViewportHeight();
    try {
      const h = await renderScreen({
        components: [{ type: 'input', field: { name: 'colore', type: 'select', label: 'Colore', options: ['rosso', 'verde'] } }, show("state.colore == null ? 'nessuno' : state.colore")],
      });
      const options = await openSelect(h.el.querySelector('lc-input nz-select')!, h.settle);
      expect(options.map((o) => plain(o.textContent))).toEqual(['rosso', 'verde']);
      options[1].click();
      await h.until(() => shown(h.el) === 'verde', 'scelta');
    } finally {
      restore();
    }
  });

  it('checkbox e switch partono falsi; onChange vede il nuovo valore', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'urgente', type: 'switch', label: 'Urgente' }, onChange: [{ toast: "{{ value ? 'sì' : 'no' }}" }] },
        { type: 'input', field: { name: 'accetto', type: 'checkbox', label: 'Accetto' } },
        show('string(state.urgente) + "/" + string(state.accetto)'),
      ],
    });
    expect(shown(h.el)).toBe('false/false');
    // La casella di spunta ha l'etichetta accanto, non sopra.
    expect(h.el.querySelectorAll('lc-input nz-form-label').length).toBe(1);
    (h.el.querySelector('lc-input nz-switch button') as HTMLButtonElement).click();
    await h.until(() => h.toasts.length === 1, 'onChange');
    expect(h.toasts).toEqual(['sì']);
    (h.el.querySelector('lc-input label[nz-checkbox] input') as HTMLInputElement).click();
    await h.until(() => shown(h.el) === 'true/true', 'stato');
  });

  it('gli errori di validazione compaiono dopo la prima modifica; una regola in errore rende il campo non valido', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'nome', type: 'text', label: 'Nome', required: true } },
        { type: 'input', field: { name: 'codice', type: 'text', label: 'Codice', validate: { rule: '{{ value.size() == 3 }}', message: 'Tre caratteri' } } },
        { type: 'input', field: { name: 'rotto', type: 'text', label: 'Rotto', validate: { rule: '{{ nonEsiste.x }}', message: 'Non valido' } } },
      ],
    });
    const [nome, codice, rotto] = [...h.el.querySelectorAll<HTMLInputElement>('lc-input input')];
    expect(h.el.querySelector('.ant-form-item-explain-error')).toBeNull();
    type(nome, 'x', 'change');
    type(nome, '', 'change');
    type(codice, 'ab', 'change');
    type(rotto, 'qualcosa', 'change');
    await h.until(() => h.el.querySelectorAll('.ant-form-item-explain-error').length === 3, 'errori');
    expect([...h.el.querySelectorAll('.ant-form-item-explain-error')].map((e) => plain(e.textContent))).toEqual(['Campo obbligatorio', 'Tre caratteri', 'Non valido']);
    expect(nome.getAttribute('aria-invalid')).toBe('true');
    type(codice, 'abc', 'change');
    await h.until(() => h.el.querySelectorAll('.ant-form-item-explain-error').length === 2, 'corretto');
  });

  it('sola lettura con readOnlyIf (del nodo o del campo) e disattivato con enabledIf', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'attivo', type: 'switch', label: 'Attivo' } },
        { type: 'input', readOnlyIf: '{{ !state.attivo }}', field: { name: 'note', type: 'textarea', label: 'Note' } },
        { type: 'input', field: { name: 'codice', type: 'text', label: 'Codice', readOnlyIf: '{{ true }}' } },
        { type: 'input', enabledIf: '{{ state.attivo }}', field: { name: 'data', type: 'date', label: 'Data' } },
      ],
    });
    const textarea = h.el.querySelector('lc-input textarea') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect((h.el.querySelectorAll('lc-input input[nz-input]')[0] as HTMLInputElement).readOnly).toBe(true);
    expect(h.el.querySelector('lc-input nz-date-picker')?.classList).toContain('ant-picker-disabled');
    (h.el.querySelector('lc-input nz-switch button') as HTMLButtonElement).click();
    await h.until(() => !textarea.readOnly, 'modificabile');
    expect(h.el.querySelector('lc-input nz-date-picker')?.classList).not.toContain('ant-picker-disabled');
  });

  it('una sezione a riga affianca i campi', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'section',
          layout: 'row',
          components: [
            { type: 'input', field: { name: 'a', type: 'text', label: 'A' } },
            { type: 'input', field: { name: 'b', type: 'text', label: 'B' } },
          ],
        },
      ],
    });
    expect(h.el.querySelector('lc-section .body')?.classList).toContain('row');
    expect(h.el.querySelectorAll('lc-section lc-input').length).toBe(2);
  });
});
