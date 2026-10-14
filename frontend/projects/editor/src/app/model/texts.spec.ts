import { ExpressionEngine } from 'expressions';
import type { Json } from './doc-ops';
import { collectTexts, keyPrefix, makeKey, translatable, usedKeys } from './texts';

describe('testi e chiavi di traduzione', () => {
  const doc: Json = {
    screen: 'ordini-elenco',
    title: "{{ t('ordini_elenco.titolo', 'Ordini') }}",
    dataSources: { elenco: { type: 'rest', method: 'GET', url: '/api/x', params: { title: 'non è un testo' } } },
    components: [
      { type: 'text', text: 'Benvenuto' },
      { type: 'button', label: "{{ t('comune.salva') }}", onClick: [{ toast: "{{ t('x.ok', 'L\\'ordine è salvato', {'n': row.numero}) }}" }] },
      { type: 'text', text: "{{ t('a.uno', 'Uno') + ' ' + t('a.due') }}" },
      { type: 'table', source: 'elenco', columns: [{ field: 'stato', label: 'Stato' }] },
    ],
  };

  it('trova i testi per l’utente e li classifica', () => {
    const entries = collectTexts(doc);
    expect(entries.map((e) => [e.path.join('/'), e.kind])).toEqual([
      ['title', 'key'],
      ['components/0/text', 'plain'],
      ['components/1/label', 'key'],
      ['components/1/onClick/0/toast', 'key'],
      ['components/2/text', 'expression'],
      ['components/3/columns/0/label', 'plain'],
    ]);
    expect(entries[0]).toMatchObject({ key: 'ordini_elenco.titolo', fallback: 'Ordini' });
    expect(entries[2]).toMatchObject({ key: 'comune.salva', fallback: undefined });
    expect(entries[3]).toMatchObject({ key: 'x.ok', fallback: "L'ordine è salvato" });
    expect(entries[4].keys).toEqual(['a.uno', 'a.due']);
    expect([...usedKeys(entries)]).toEqual(['ordini_elenco.titolo', 'comune.salva', 'x.ok', 'a.uno', 'a.due']);
  });

  it('chiavi nuove leggibili e uniche', () => {
    expect(keyPrefix('ordini-elenco')).toBe('ordini_elenco');
    expect(makeKey('ordini-elenco', 'Città di consegna!', new Set())).toBe('ordini_elenco.citta_di_consegna');
    expect(makeKey('p', 'Stato', new Set(['p.stato']))).toBe('p.stato_2');
    expect(makeKey('p', '???', new Set())).toBe('p.testo');
    expect(makeKey('p', 'Una frase molto lunga che non entra tutta nella chiave', new Set())).toBe('p.una_frase_molto_lunga_che_non');
  });

  it('il testo traducibile è un’espressione valida con il testo come ripiego', () => {
    const value = translatable('p.ordine', "L'ordine \\ è pronto")!;
    expect(value).toBe("{{ t('p.ordine', 'L\\'ordine \\\\ è pronto') }}");
    const engine = new ExpressionEngine({ can: () => false });
    expect(engine.checkTemplate(value).valid).toBe(true);
    expect(collectTexts({ text: value } as Json)[0]).toMatchObject({ kind: 'key', key: 'p.ordine', fallback: "L'ordine \\ è pronto" });
    expect(translatable('p.x', 'Totale {n}')).toBeNull();
  });

  it('un testo su più righe (Markdown) diventa un’espressione valida e torna uguale', () => {
    const text = 'Prima di **inviare**:\n\n- controlla i dati\n- allega la fattura';
    const value = translatable('p.istruzioni', text)!;
    expect(value).not.toContain('\n');
    const engine = new ExpressionEngine({ can: () => false });
    expect(engine.checkTemplate(value).valid).toBe(true);
    expect(collectTexts({ text: value } as Json)[0]).toMatchObject({ kind: 'key', fallback: text });
  });
});
