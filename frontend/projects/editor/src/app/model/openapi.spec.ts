import { OpenApiError, dataSourceOf, readOpenApi, sourceNameOf } from './openapi';

/** Documento OpenAPI 3 come lo produce springdoc: server assoluto, risposte «*\/*», riferimenti agli schemi. */
const springdoc = {
  openapi: '3.0.1',
  info: { title: 'Ordini', version: '2.1' },
  servers: [{ url: 'http://localhost:8080/gestionale' }],
  paths: {
    '/api/ordini': {
      get: {
        tags: ['ordini'],
        summary: 'Elenco',
        operationId: 'listOrdini',
        parameters: [{ $ref: '#/components/parameters/Stato' }, { name: 'page', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: 'OK', content: { '*/*': { schema: { type: 'array', items: { $ref: '#/components/schemas/Ordine' } } } } } },
      },
      post: {
        tags: ['ordini'],
        operationId: 'create_ordine',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Ordine' } } } },
        responses: { '201': { description: 'Creato' } },
      },
    },
    '/api/ordini/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { description: 'Dettaglio\nseconda riga', responses: { '200': { description: 'OK', content: { 'application/json': { example: { id: 7 } } } } } },
      delete: { operationId: 'deleteOrdine', responses: { '204': { description: 'OK' } } },
      options: { responses: {} },
    },
    '/api/report/{{ evil }}': { get: { responses: {} } },
    '/api/strano path': { get: { responses: {} } },
  },
  components: {
    parameters: { Stato: { name: 'stato', in: 'query', required: true, schema: { type: 'string' } } },
    schemas: {
      Ordine: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 100 },
          cliente: { type: 'string' },
          stato: { type: 'string', enum: ['bozza', 'inviato'] },
          data: { type: 'string', format: 'date' },
          righe: { type: 'array', items: { $ref: '#/components/schemas/Riga' } },
          padre: { $ref: '#/components/schemas/Ordine' },
        },
      },
      Riga: { allOf: [{ type: 'object', properties: { articolo: { type: 'string' } } }, { type: 'object', properties: { quantita: { type: 'number' } } }] },
    },
  },
};

describe('importazione da OpenAPI', () => {
  it('legge un documento springdoc: prefisso dal server, operazioni con parametri, corpo, tag e descrizione', () => {
    const api = readOpenApi(springdoc);
    expect([api.title, api.version, api.basePath]).toEqual(['Ordini', '2.1', '/gestionale']);
    // OPTIONS non diventa un data source; i percorsi con «{{» o caratteri inattesi si scartano.
    expect(api.operations.map((o) => o.key)).toEqual(['GET /api/ordini', 'POST /api/ordini', 'GET /api/ordini/{id}', 'DELETE /api/ordini/{id}']);
    const [list, create, detail] = api.operations;
    expect(list).toMatchObject({ tag: 'ordini', summary: 'Elenco', queryParams: [{ name: 'stato', required: true }, { name: 'page', required: false }], body: false });
    expect(create.body).toBe(true);
    expect(create.sample).toBeUndefined();
    expect(detail).toMatchObject({ summary: 'Dettaglio', pathParams: ['id'], sample: { id: 7 } });
  });

  it('dati di esempio dallo schema: elementi distinti negli elenchi, enum, formati, allOf; i riferimenti ricorsivi si fermano', () => {
    const sample = readOpenApi(springdoc).operations[0].sample as Record<string, unknown>[];
    expect(sample).toHaveLength(2);
    expect(sample.map((o) => o['id'])).toEqual([100, 101]);
    expect(sample.map((o) => o['stato'])).toEqual(['bozza', 'inviato']);
    expect(sample[0]['cliente']).toBe('cliente 1');
    expect(sample[0]['data']).toBe('2026-01-15');
    expect((sample[0]['righe'] as unknown[])[0]).toEqual({ articolo: 'articolo 1', quantita: 1 });
    // Ordine → padre → padre …: si ferma a una profondità fissa.
    let depth = 0;
    for (let node = sample[0] as Record<string, unknown> | null; node; node = node['padre'] as Record<string, unknown> | null) depth++;
    expect(depth).toBeLessThan(10);
  });

  it('data source: prefisso e percorso, parametri dai parametri della schermata, corpo dal form', () => {
    const [list, create, detail, remove] = readOpenApi(springdoc).operations;
    expect(dataSourceOf(list, '/gestionale')).toEqual({ type: 'rest', method: 'GET', url: '/gestionale/api/ordini', params: { stato: '{{ params.stato }}' } });
    expect(dataSourceOf(create, '')).toEqual({ type: 'rest', method: 'POST', url: '/api/ordini', body: '{{ form }}' });
    expect(dataSourceOf(detail, '/gestionale/')).toEqual({ type: 'rest', method: 'GET', url: '/gestionale/api/ordini/{{ params.id }}' });
    expect(dataSourceOf(remove, 'non valido {x}')).toEqual({ type: 'rest', method: 'DELETE', url: '/api/ordini/{{ params.id }}' });
  });

  it('nomi validi e unici: da operationId in camelCase, altrimenti da metodo e percorso', () => {
    const [list, create, detail] = readOpenApi(springdoc).operations;
    expect(sourceNameOf(list, new Set())).toBe('listOrdini');
    expect(sourceNameOf(create, new Set())).toBe('createOrdine');
    expect(sourceNameOf(detail, new Set())).toBe('getApiOrdiniById');
    expect(sourceNameOf(list, new Set(['listOrdini', 'listOrdini2']))).toBe('listOrdini3');
  });

  it('Swagger 2.0: basePath, parametri del corpo, esempi e definizioni', () => {
    const api = readOpenApi({
      swagger: '2.0',
      info: { title: 'Vecchia', version: '1' },
      basePath: '/v1/',
      paths: {
        '/clienti': {
          get: { operationId: 'clienti', responses: { '200': { schema: { type: 'array', items: { $ref: '#/definitions/Cliente' } } } } },
          post: { parameters: [{ in: 'body', name: 'cliente', schema: { $ref: '#/definitions/Cliente' } }], responses: {} },
        },
      },
      definitions: { Cliente: { type: 'object', properties: { nome: { type: 'string', example: 'Rossi' } } } },
    });
    expect(api.basePath).toBe('/v1');
    expect(api.operations[0].sample).toEqual([{ nome: 'Rossi' }, { nome: 'Rossi' }]);
    expect(api.operations[1].body).toBe(true);
  });

  it('documenti non validi', () => {
    const reason = (doc: unknown) => {
      try {
        readOpenApi(doc);
        return null;
      } catch (e) {
        return e instanceof OpenApiError ? e.reason : 'altro';
      }
    };
    expect(reason(null)).toBe('notOpenApi');
    expect(reason({ openapi: '2.0', paths: {} })).toBe('notOpenApi');
    expect(reason({ swagger: '2.0' })).toBe('notOpenApi');
    expect(reason({ openapi: '3.1.0', paths: { '/x': { options: {} } } })).toBe('noOperations');
  });
});
