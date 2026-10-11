import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';
import { parseIsoDateTime, toIsoDateTime } from './shared';

describe('nuovi tipi di campo', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('data e ora: conversione in ora locale, andata e ritorno', () => {
    const date = parseIsoDateTime('2026-10-07T14:30');
    expect(date?.getHours()).toBe(14);
    expect(toIsoDateTime(date)).toBe('2026-10-07T14:30');
    expect(parseIsoDateTime('2026-10-07')).toBeNull();
    expect(parseIsoDateTime('oggi')).toBeNull();
  });

  const form: NodeDefinition = {
    type: 'form',
    initial: { quando: '2026-10-07T14:30', urgente: false, canali: ['email'] },
    fields: [
      { name: 'note', type: 'textarea', label: 'Note', rows: 6, required: true },
      { name: 'quando', type: 'datetime', label: 'Quando' },
      { name: 'priorita', type: 'radio', label: 'Priorità', options: ['bassa', 'alta'], optionKey: 'prio' },
      { name: 'urgente', type: 'switch', label: 'Urgente' },
      { name: 'canali', type: 'multiselect', label: 'Canali', options: ['email', 'sms', 'posta'], required: true },
    ],
    actions: [{ label: 'Salva', onClick: [{ call: 'salva' }] }],
  };
  const dataSources = { salva: { type: 'rest' as const, method: 'POST' as const, url: '/api/salva', body: '{{form}}' } };
  const settleWith = (h: ScreenHarness) => () => h.settle();
  const save = (h: ScreenHarness): void => ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Salva')) as HTMLButtonElement).click();

  it('nel form: area di testo, data e ora, radio, interruttore e selezione multipla arrivano al servizio', async () => {
    const h = await renderScreen({ components: [form], dataSources });
    const textarea = h.el.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.rows).toBe(6);
    expect((h.el.querySelector('nz-date-picker input') as HTMLInputElement).value).toBe('07/10/2026 14:30');
    textarea.value = 'Prima riga\nSeconda riga';
    textarea.dispatchEvent(new Event('input'));
    (h.el.querySelectorAll<HTMLInputElement>('nz-radio-group input[type="radio"]')[1]).click();
    (h.el.querySelector('nz-switch button') as HTMLButtonElement).click();
    const options = await openSelect(h.el.querySelector('nz-select') as Element, settleWith(h));
    options.find((o) => plain(o.textContent) === 'sms')!.click();
    await h.settle();
    save(h);
    await h.until(() => h.requests.length === 1, 'salvataggio');
    expect(h.requests[0].body).toEqual({ note: 'Prima riga\nSeconda riga', quando: '2026-10-07T14:30', priorita: 'alta', urgente: true, canali: ['email', 'sms'] });
  });

  it('obbligatori: area di testo vuota e selezione multipla senza valori bloccano l’invio', async () => {
    const h = await renderScreen({ components: [{ ...form, initial: { canali: [] } } as NodeDefinition], dataSources });
    save(h);
    await h.settle();
    expect(h.el.querySelectorAll('.ant-form-item-explain-error').length).toBe(2);
    expect(h.requests).toEqual([]);
  });

  it('nella barra dei filtri: selezione multipla, interruttore e radio con «Tutti» scrivono nello stato', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'filterBar',
          bind: 'state.filtri',
          fields: [
            { name: 'stati', type: 'multiselect', label: 'Stati', options: ['bozza', 'inviata', 'pagata'] },
            { name: 'scadute', type: 'switch', label: 'Solo scadute' },
            { name: 'tipo', type: 'radio', label: 'Tipo', options: ['attiva', 'passiva'] },
            { name: 'nota', type: 'textarea', label: 'Nota' },
          ],
        },
      ],
      dataSources: {
        dati: { type: 'rest', method: 'GET', url: '/api/dati', params: { stati: '{{state.filtri.stati}}', scadute: '{{state.filtri.scadute}}', tipo: '{{state.filtri.tipo}}' } },
      },
      respond: () => [],
    });
    expect(h.requests.at(-1)?.query).toEqual({});
    expect(h.el.querySelector('input[type="text"]')).not.toBeNull();
    const options = await openSelect(h.el.querySelector('nz-select') as Element, settleWith(h));
    options.find((o) => plain(o.textContent) === 'bozza')!.click();
    options.find((o) => plain(o.textContent) === 'pagata')!.click();
    (h.el.querySelector('nz-switch button') as HTMLButtonElement).click();
    const radios = h.el.querySelectorAll<HTMLInputElement>('nz-radio-group input[type="radio"]');
    expect(radios).toHaveLength(3);
    radios[2].click();
    await h.until(() => h.requests.at(-1)?.query?.['tipo'] === 'passiva', 'filtri applicati');
    expect(h.requests.at(-1)?.query).toEqual({ stati: ['bozza', 'pagata'], scadute: true, tipo: 'passiva' });
    // «Tutti» toglie il filtro.
    radios[0].click();
    await h.until(() => h.requests.at(-1)?.query?.['tipo'] === undefined, 'tipo tolto');
  });
});
