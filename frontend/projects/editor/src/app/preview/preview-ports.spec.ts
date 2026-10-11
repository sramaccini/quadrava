import { matchSource } from './preview-ports';

describe('anteprima: richieste e data source', () => {
  const sources = {
    elenco: { type: 'rest', method: 'GET', url: '/api/ordini' },
    dettaglio: { type: 'rest', method: 'GET', url: '/api/ordini/{{ params.id }}' },
    approva: { type: 'rest', method: 'POST', url: '/api/ordini/{{id}}/approva' },
  };

  it('riconosce il data source dal metodo e dall’URL, con le parti {{ }} libere', () => {
    expect(matchSource(sources, { method: 'GET', url: '/api/ordini' })).toBe('elenco');
    expect(matchSource(sources, { method: 'GET', url: '/api/ordini/7' })).toBe('dettaglio');
    expect(matchSource(sources, { method: 'POST', url: '/api/ordini/a%2Fb/approva' })).toBe('approva');
    expect(matchSource(sources, { method: 'DELETE', url: '/api/ordini' })).toBeNull();
    expect(matchSource(sources, { method: 'GET', url: '/api/ordini/7/righe' })).toBeNull();
  });
});
