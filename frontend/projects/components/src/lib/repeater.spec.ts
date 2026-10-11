import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('righe ripetibili nel form', () => {
  const form = (extra: Record<string, unknown> = {}): NodeDefinition => ({
    type: 'form',
    fields: [
      {
        name: 'righe',
        type: 'repeater',
        label: 'Righe',
        minRows: 1,
        maxRows: 3,
        addLabel: 'Aggiungi articolo',
        fields: [
          { name: 'descrizione', type: 'text', label: 'Descrizione', required: true },
          { name: 'quantita', type: 'number', label: 'Quantità', validate: { rule: '{{ value > 0 }}', message: 'Quantità positiva' } },
          { name: 'omaggio', type: 'checkbox', label: 'Omaggio' },
        ],
        ...extra,
      },
    ],
    actions: [{ label: 'Salva', onClick: [{ call: 'salva' }] }],
  });
  const dataSources = { salva: { type: 'rest' as const, method: 'POST' as const, url: '/api/salva', body: '{{form}}' } };
  const rows = (h: ScreenHarness): HTMLTableRowElement[] => [...h.el.querySelectorAll<HTMLTableRowElement>('lc-repeater tbody tr')];
  const typeIn = (input: Element | null, value: string): void => {
    (input as HTMLInputElement).value = value;
    input!.dispatchEvent(new Event('input'));
  };
  const button = (h: ScreenHarness, text: string): HTMLButtonElement => [...h.el.querySelectorAll('button')].find((b) => plain(b.textContent).includes(text)) as HTMLButtonElement;

  it('parte con le righe minime, aggiunge e toglie nei limiti e salva un elenco di oggetti', async () => {
    const h = await renderScreen({ components: [form()], dataSources });
    expect(rows(h)).toHaveLength(1);
    // Con una sola riga (il minimo) non si può togliere.
    expect((rows(h)[0].querySelector('td.remove button') as HTMLButtonElement).disabled).toBe(true);
    expect(h.el.querySelector('lc-repeater [role="group"]')?.getAttribute('aria-labelledby')).toMatch(/-righe-label$/);
    typeIn(rows(h)[0].querySelector('input[type="text"]'), 'Penne');
    typeIn(rows(h)[0].querySelector('input[type="number"]'), '10');
    button(h, 'Aggiungi articolo').click();
    await h.settle();
    button(h, 'Aggiungi articolo').click();
    await h.settle();
    expect(rows(h)).toHaveLength(3);
    expect(button(h, 'Aggiungi articolo').disabled).toBe(true);
    typeIn(rows(h)[1].querySelector('input[type="text"]'), 'Matite');
    typeIn(rows(h)[1].querySelector('input[type="number"]'), '5');
    (rows(h)[1].querySelector('label[nz-checkbox] input') as HTMLInputElement).click();
    const remove = rows(h)[2].querySelector('td.remove button') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Togli la riga 3');
    remove.click();
    await h.settle();
    button(h, 'Salva').click();
    await h.until(() => h.requests.length === 1, 'salvataggio');
    expect(h.requests[0].body).toEqual({
      righe: [
        { descrizione: 'Penne', quantita: 10, omaggio: false },
        { descrizione: 'Matite', quantita: 5, omaggio: true },
      ],
    });
  });

  it('obbligatori e regole valgono riga per riga; gli errori compaiono dopo l’invio', async () => {
    const h = await renderScreen({ components: [form()], dataSources });
    button(h, 'Aggiungi articolo').click();
    await h.settle();
    typeIn(rows(h)[0].querySelector('input[type="text"]'), 'Penne');
    typeIn(rows(h)[0].querySelector('input[type="number"]'), '0');
    await h.settle();
    expect(h.el.querySelectorAll('lc-repeater .cell-error')).toHaveLength(0);
    button(h, 'Salva').click();
    await h.settle();
    const errors = [...h.el.querySelectorAll('lc-repeater .cell-error')].map((e) => plain(e.textContent));
    expect(errors).toEqual(['Quantità positiva', 'Campo obbligatorio']);
    expect(plain(h.el.querySelector('lc-repeater .summary')?.textContent)).toBe('Controlla le righe evidenziate');
    // Solo le celle sbagliate sono evidenziate, non tutto il campo.
    expect(h.el.querySelector('nz-form-item.ant-form-item-has-error')).toBeNull();
    expect(h.requests).toEqual([]);
  });

  it('i valori iniziali arrivano dal form e un numero di righe sotto il minimo è un errore', async () => {
    const h = await renderScreen({
      components: [{ ...form({ minRows: 2 }), initial: { righe: [{ descrizione: 'Gomme', quantita: 3, omaggio: false }] } } as NodeDefinition],
      dataSources,
    });
    // La riga iniziale più una vuota per arrivare al minimo.
    expect(rows(h)).toHaveLength(2);
    expect((rows(h)[0].querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Gomme');
  });

  describe('con lookup e file nelle righe', () => {
    let restore: () => void;
    beforeAll(() => (restore = stubViewportHeight()));
    afterAll(() => restore());
    afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

    it('ogni riga ha il suo lookup e il suo file; i valori arrivano al salvataggio', async () => {
      const articles = [{ id: 'A1', nome: 'Penne' }, { id: 'A2', nome: 'Matite' }];
      const node = {
        type: 'form',
        fields: [
          {
            name: 'righe',
            type: 'repeater',
            minRows: 1,
            fields: [
              { name: 'articolo', type: 'lookup', label: 'Articolo', required: true, lookup: { source: 'articoli', labelField: 'nome', minChars: 0 } },
              { name: 'foto', type: 'file', label: 'Foto', accept: 'image/*' },
            ],
          },
        ],
        actions: [{ label: 'Salva', onClick: [{ call: 'salva' }] }],
      } as NodeDefinition;
      const h = await renderScreen({
        components: [node],
        dataSources: { ...dataSources, articoli: { type: 'rest', method: 'GET', url: '/api/articoli' } },
        respond: (r) => (r.method === 'GET' ? articles : {}),
      });
      await h.until(() => !!h.el.querySelector('lc-repeater lc-lookup nz-select'), 'riga');
      await openSelect(h.el.querySelector('lc-repeater lc-lookup nz-select')!, () => h.settle());
      await h.until(() => document.querySelectorAll('.ant-select-item-option').length === 2, 'articoli');
      ([...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => plain(o.textContent) === 'Matite'))!.click();
      const input = h.el.querySelector('lc-repeater lc-file-field input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'foto.png', { type: 'image/png' })] });
      input.dispatchEvent(new Event('change'));
      await h.until(() => !!h.el.querySelector('lc-repeater lc-file-field .name'), 'foto scelta');
      button(h, 'Salva').click();
      await h.until(() => h.requests.some((r) => r.method === 'POST'), 'salvataggio');
      expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ righe: [{ articolo: 'A2', foto: { name: 'foto.png', type: 'image/png', size: 1, content: btoa('x') } }] });
    });
  });
});
