import { OpenApiError, dataSourceOf, readOpenApi, sourceNameOf } from './openapi';

/** OpenAPI 3 document as springdoc produces it: absolute server, «*\/*» responses, references to schemas. */
const springdoc = {
  openapi: '3.0.1',
  info: { title: 'Orders', version: '2.1' },
  servers: [{ url: 'http://localhost:8080/accounting' }],
  paths: {
    '/api/orders': {
      get: {
        tags: ['orders'],
        summary: 'List',
        operationId: 'listOrders',
        parameters: [{ $ref: '#/components/parameters/Status' }, { name: 'page', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: 'OK', content: { '*/*': { schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } } } } } },
      },
      post: {
        tags: ['orders'],
        operationId: 'create_order',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/api/orders/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: { description: 'Detail\nsecond line', responses: { '200': { description: 'OK', content: { 'application/json': { example: { id: 7 } } } } } },
      delete: { operationId: 'deleteOrder', responses: { '204': { description: 'OK' } } },
      options: { responses: {} },
    },
    '/api/report/{{ evil }}': { get: { responses: {} } },
    '/api/odd path': { get: { responses: {} } },
  },
  components: {
    parameters: { Status: { name: 'status', in: 'query', required: true, schema: { type: 'string' } } },
    schemas: {
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 100 },
          customer: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'submitted'] },
          date: { type: 'string', format: 'date' },
          lines: { type: 'array', items: { $ref: '#/components/schemas/Line' } },
          parent: { $ref: '#/components/schemas/Order' },
        },
      },
      Line: { allOf: [{ type: 'object', properties: { article: { type: 'string' } } }, { type: 'object', properties: { quantity: { type: 'number' } } }] },
    },
  },
};

describe('import from OpenAPI', () => {
  it('reads a springdoc document: prefix from the server, operations with parameters, body, tag and description', () => {
    const api = readOpenApi(springdoc);
    expect([api.title, api.version, api.basePath]).toEqual(['Orders', '2.1', '/accounting']);
    // OPTIONS does not become a date source; paths with «{{» or unexpected characters are discarded.
    expect(api.operations.map((o) => o.key)).toEqual(['GET /api/orders', 'POST /api/orders', 'GET /api/orders/{id}', 'DELETE /api/orders/{id}']);
    const [list, create, detail] = api.operations;
    expect(list).toMatchObject({ tag: 'orders', summary: 'List', queryParams: [{ name: 'status', required: true }, { name: 'page', required: false }], body: false });
    expect(create.body).toBe(true);
    expect(create.sample).toBeUndefined();
    expect(detail).toMatchObject({ summary: 'Detail', pathParams: ['id'], sample: { id: 7 } });
  });

  it('sample date from the schema: distinct elements in lists, enum, formats, allOf; recursive references stop', () => {
    const sample = readOpenApi(springdoc).operations[0].sample as Record<string, unknown>[];
    expect(sample).toHaveLength(2);
    expect(sample.map((o) => o['id'])).toEqual([100, 101]);
    expect(sample.map((o) => o['status'])).toEqual(['draft', 'submitted']);
    expect(sample[0]['customer']).toBe('customer 1');
    expect(sample[0]['date']).toBe('2026-01-15');
    expect((sample[0]['lines'] as unknown[])[0]).toEqual({ article: 'article 1', quantity: 1 });
    // Order → parent → parent …: it stops at a fixed depth.
    let depth = 0;
    for (let node = sample[0] as Record<string, unknown> | null; node; node = node['parent'] as Record<string, unknown> | null) depth++;
    expect(depth).toBeLessThan(10);
  });

  it('date source: prefix and path, parameters from the parameters of the screen, body from the form', () => {
    const [list, create, detail, remove] = readOpenApi(springdoc).operations;
    expect(dataSourceOf(list, '/accounting')).toEqual({ type: 'rest', method: 'GET', url: '/accounting/api/orders', params: { status: '{{ params.status }}' } });
    expect(dataSourceOf(create, '')).toEqual({ type: 'rest', method: 'POST', url: '/api/orders', body: '{{ form }}' });
    expect(dataSourceOf(detail, '/accounting/')).toEqual({ type: 'rest', method: 'GET', url: '/accounting/api/orders/{{ params.id }}' });
    expect(dataSourceOf(remove, 'not valid {x}')).toEqual({ type: 'rest', method: 'DELETE', url: '/api/orders/{{ params.id }}' });
  });

  it('valid and unique names: from operationId in camelCase, otherwise from method and path', () => {
    const [list, create, detail] = readOpenApi(springdoc).operations;
    expect(sourceNameOf(list, new Set())).toBe('listOrders');
    expect(sourceNameOf(create, new Set())).toBe('createOrder');
    expect(sourceNameOf(detail, new Set())).toBe('getApiOrdersById');
    expect(sourceNameOf(list, new Set(['listOrders', 'listOrders2']))).toBe('listOrders3');
  });

  it('Swagger 2.0: basePath, body parameters, examples and definitions', () => {
    const api = readOpenApi({
      swagger: '2.0',
      info: { title: 'Old', version: '1' },
      basePath: '/v1/',
      paths: {
        '/customers': {
          get: { operationId: 'customers', responses: { '200': { schema: { type: 'array', items: { $ref: '#/definitions/Customer' } } } } },
          post: { parameters: [{ in: 'body', name: 'customer', schema: { $ref: '#/definitions/Customer' } }], responses: {} },
        },
      },
      definitions: { Customer: { type: 'object', properties: { name: { type: 'string', example: 'Smith' } } } },
    });
    expect(api.basePath).toBe('/v1');
    expect(api.operations[0].sample).toEqual([{ name: 'Smith' }, { name: 'Smith' }]);
    expect(api.operations[1].body).toBe(true);
  });

  it('invalid documents', () => {
    const reason = (doc: unknown) => {
      try {
        readOpenApi(doc);
        return null;
      } catch (e) {
        return e instanceof OpenApiError ? e.reason : 'other';
      }
    };
    expect(reason(null)).toBe('notOpenApi');
    expect(reason({ openapi: '2.0', paths: {} })).toBe('notOpenApi');
    expect(reason({ swagger: '2.0' })).toBe('notOpenApi');
    expect(reason({ openapi: '3.1.0', paths: { '/x': { options: {} } } })).toBe('noOperations');
  });
});
