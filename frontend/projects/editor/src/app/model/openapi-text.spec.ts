import { readOpenApi } from './openapi';
import { ApiTextError, parseApiText } from './openapi-text';

describe('text of an OpenAPI document: JSON or YAML', () => {
  it('reads JSON, and Swagger 2 in YAML with its operations', async () => {
    expect(await parseApiText('{"openapi": "3.0.1"}')).toEqual({ openapi: '3.0.1' });
    const yaml = `﻿swagger: "2.0"
info:
  title: Staff
  version: "1"
basePath: /api
paths:
  /staff/{id}:
    get:
      tags: [staff]
      operationId: getStaff
      parameters:
        - name: id
          in: path
          required: true
          type: integer
      responses:
        "200":
          description: OK
`;
    const api = readOpenApi(await parseApiText(yaml));
    expect(api.title).toBe('Staff');
    expect(api.basePath).toBe('/api');
    expect(api.operations.map((op) => `${op.method} ${op.path}`)).toEqual(['GET /staff/{id}']);
  });

  it('refuses a page, a plain value, repeated keys and a document that expands to a huge one', async () => {
    await expect(parseApiText('<!doctype html><title>Swagger UI</title>')).rejects.toBeInstanceOf(ApiTextError);
    await expect(parseApiText('just text')).rejects.toBeInstanceOf(ApiTextError);
    await expect(parseApiText('- a\n- b')).rejects.toBeInstanceOf(ApiTextError);
    await expect(parseApiText('openapi: 3.0.1\nopenapi: 3.1.0')).rejects.toBeInstanceOf(ApiTextError);
    const lots = ['a: &a [x, x, x, x, x, x, x, x, x, x]', ...'bcdefghij'.split('').map((k, i) => `${k}: &${k} [${Array(10).fill('*' + 'abcdefghij'[i]).join(', ')}]`)].join('\n');
    await expect(parseApiText(lots)).rejects.toBeInstanceOf(ApiTextError);
  });

  it('YAML is plain data: no dates or other types made from text', async () => {
    expect(await parseApiText('info:\n  version: 2026-10-28\n')).toEqual({ info: { version: '2026-10-28' } });
  });
});
