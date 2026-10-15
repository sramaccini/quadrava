import { isObject, type Json, type JsonObject } from './doc-ops';
import { SOURCE_NAME } from './editor-store';

/** Methods that become data sources. */
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** An operation of the OpenAPI document, enough to make a data source of it. */
export interface ApiOperation {
  /** «GET /api/orders/{id}»: identifies the operation in the document. */
  key: string;
  method: ApiMethod;
  path: string;
  operationId: string | null;
  summary: string;
  /** First tag (group), empty if it has none. */
  tag: string;
  pathParams: string[];
  queryParams: { name: string; required: boolean }[];
  /** It has a JSON body (POST, PUT, PATCH). */
  body: boolean;
  /** Sample data of the response (only for reads): the example of the document or one built from the schema. */
  sample: Json | undefined;
}

export interface ApiDescription {
  title: string;
  version: string;
  /** Prefix of the addresses, from the first server (OpenAPI 3) or from basePath (Swagger 2): «/api», or empty. */
  basePath: string;
  operations: ApiOperation[];
}

/** The document cannot be read: `reason` is the key of the message (`ed.openapi.error.*`). */
export class OpenApiError extends Error {
  constructor(readonly reason: 'notJson' | 'notOpenApi' | 'noOperations') {
    super(reason);
  }
}

/** Accepted path: letters, digits, `-._~/` and the `{name}` placeholders; never `{{`. */
const SAFE_PATH = /^\/[A-Za-z0-9._~\-/{}]*$/;
const PATH_PARAM = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
/** Limits for huge or recursive documents. */
const MAX_OPERATIONS = 500;
const MAX_DEPTH = 6;

/**
 * Reads an OpenAPI 3.x or Swagger 2.0 document (for example the one springdoc exposes in Spring Boot at
 * `/v3/api-docs`) and derives its operations. The document is data: only strings and schemas are read, paths
 * with unexpected characters are discarded, texts are shown as text.
 */
export function readOpenApi(doc: unknown): ApiDescription {
  if (!isObject(doc as Json)) throw new OpenApiError('notOpenApi');
  const root = doc as JsonObject;
  const v3 = typeof root['openapi'] === 'string' && root['openapi'].startsWith('3.');
  const v2 = root['swagger'] === '2.0';
  if ((!v3 && !v2) || !isObject(root['paths'])) throw new OpenApiError('notOpenApi');
  const info = isObject(root['info']) ? root['info'] : {};
  const operations: ApiOperation[] = [];
  for (const [path, item] of Object.entries(root['paths'] as JsonObject)) {
    if (!SAFE_PATH.test(path) || path.includes('{{') || !isObject(item)) continue;
    const shared = Array.isArray(item['parameters']) ? item['parameters'] : [];
    for (const lower of METHODS) {
      const op = item[lower];
      if (!isObject(op) || operations.length >= MAX_OPERATIONS) continue;
      operations.push(readOperation(root, v3, lower.toUpperCase() as ApiMethod, path, op, shared));
    }
  }
  if (!operations.length) throw new OpenApiError('noOperations');
  return {
    title: text(info['title']) || 'API',
    version: text(info['version']),
    basePath: v3 ? serverPath(root['servers']) : cleanBase(text(root['basePath'])),
    operations,
  };
}

function readOperation(root: JsonObject, v3: boolean, method: ApiMethod, path: string, op: JsonObject, shared: Json[]): ApiOperation {
  const params = [...shared, ...(Array.isArray(op['parameters']) ? op['parameters'] : [])].map((p) => resolve(root, p)).filter(isObject);
  const pathParams = [...path.matchAll(PATH_PARAM)].map((m) => m[1]);
  const queryParams = params
    .filter((p) => p['in'] === 'query' && typeof p['name'] === 'string' && SOURCE_NAME.test(p['name']))
    .map((p) => ({ name: p['name'] as string, required: p['required'] === true }));
  const body = method !== 'GET' && method !== 'DELETE' && (v3 ? isObject(resolve(root, op['requestBody'])) : params.some((p) => p['in'] === 'body' || p['in'] === 'formData'));
  const tags = Array.isArray(op['tags']) ? op['tags'] : [];
  const summary = text(op['summary']) || text(op['description']).split('\n')[0];
  return {
    key: `${method} ${path}`,
    method,
    path,
    operationId: typeof op['operationId'] === 'string' ? op['operationId'] : null,
    summary: summary.slice(0, 200),
    tag: text(tags[0]),
    pathParams,
    queryParams,
    body,
    sample: method === 'GET' ? responseSample(root, v3, op) : undefined,
  };
}

/** Sample data of the first successful response: the example of the document, otherwise built from the schema. */
function responseSample(root: JsonObject, v3: boolean, op: JsonObject): Json | undefined {
  const responses = isObject(op['responses']) ? op['responses'] : {};
  const code = ['200', '201', '2XX', 'default'].find((c) => isObject(responses[c])) ?? Object.keys(responses).find((c) => c.startsWith('2'));
  const response = code ? resolve(root, responses[code]) : undefined;
  if (!isObject(response)) return undefined;
  if (v3) {
    const content = isObject(response['content']) ? response['content'] : {};
    // springdoc often uses «*/*»; otherwise the first JSON type.
    const media = Object.entries(content).find(([type]) => type.includes('json') || type === '*/*')?.[1];
    if (!isObject(media)) return undefined;
    if (media['example'] !== undefined) return media['example'];
    const examples = isObject(media['examples']) ? Object.values(media['examples']) : [];
    const first = examples.length ? resolve(root, examples[0]) : undefined;
    if (isObject(first) && first['value'] !== undefined) return first['value'];
    return media['schema'] !== undefined ? sampleOf(root, media['schema'], '', 0, 0) : undefined;
  }
  const examples = isObject(response['examples']) ? response['examples'] : {};
  if (examples['application/json'] !== undefined) return examples['application/json'];
  return response['schema'] !== undefined ? sampleOf(root, response['schema'], '', 0, 0) : undefined;
}

/**
 * A sample value for a schema: the example of the schema, the first allowed value, or a plausible one by type and
 * format (with the name of the property for texts). Lists have two elements, different from each other (`index`).
 */
export function sampleOf(root: JsonObject, raw: Json, name: string, index: number, depth: number): Json {
  const schema = resolve(root, raw);
  if (!isObject(schema) || depth > MAX_DEPTH) return null;
  // The example of the schema; in lists the numbers change from one element to the next (distinct identifiers).
  if (schema['example'] !== undefined) return typeof schema['example'] === 'number' ? schema['example'] + index : schema['example'];
  if (Array.isArray(schema['enum']) && schema['enum'].length) return schema['enum'][index % schema['enum'].length];
  const parts = ['allOf', 'oneOf', 'anyOf'].map((k) => schema[k]).find(Array.isArray) as Json[] | undefined;
  if (parts) {
    if (Array.isArray(schema['allOf'])) {
      const merged: JsonObject = {};
      for (const part of parts) {
        const value = sampleOf(root, part, name, index, depth + 1);
        if (isObject(value)) Object.assign(merged, value);
      }
      return merged;
    }
    return sampleOf(root, parts[0], name, index, depth + 1);
  }
  const type = Array.isArray(schema['type']) ? schema['type'].find((t) => t !== 'null') : schema['type'];
  if (type === 'array' || (type === undefined && schema['items'] !== undefined)) {
    return depth >= MAX_DEPTH ? [] : [0, 1].map((i) => sampleOf(root, schema['items'] ?? {}, name, i, depth + 1));
  }
  if (type === 'object' || isObject(schema['properties'])) {
    const properties = isObject(schema['properties']) ? Object.entries(schema['properties']).slice(0, 30) : [];
    return Object.fromEntries(properties.map(([key, value]) => [key, sampleOf(root, value, key, index, depth + 1)]));
  }
  if (type === 'integer' || type === 'number') return index + 1;
  if (type === 'boolean') return index % 2 === 0;
  if (type === 'string') {
    const format = text(schema['format']);
    if (format === 'date') return `2026-01-${String(15 + index).padStart(2, '0')}`;
    if (format === 'date-time') return `2026-01-${String(15 + index).padStart(2, '0')}T10:00:00Z`;
    if (format === 'email') return `nome${index + 1}@example.com`;
    if (format === 'uuid') return `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`;
    return `${name || 'text'} ${index + 1}`;
  }
  return null;
}

/**
 * The data source of an operation. Address: prefix plus path, with the path parameters from the parameters of the
 * screen (`{{ params.id }}`); the required query parameters in the same way (the optional ones not: a
 * missing variable would make the expression fail); the body from the form (`{{ form }}`).
 */
export function dataSourceOf(op: ApiOperation, basePath: string): JsonObject {
  const url = cleanBase(basePath) + op.path.replace(PATH_PARAM, (_, name: string) => `{{ params.${name} }}`);
  const source: JsonObject = { type: 'rest', method: op.method, url };
  const required = op.queryParams.filter((p) => p.required);
  if (required.length) source['params'] = Object.fromEntries(required.map((p) => [p.name, `{{ params.${p.name} }}`]));
  if (op.body) source['body'] = '{{ form }}';
  return source;
}

/**
 * Name of the data source: from the `operationId` (in camelCase), otherwise from method and path («getOrdersById»); valid
 * as an identifier and different from those already used.
 */
export function sourceNameOf(op: ApiOperation, used: ReadonlySet<string>): string {
  const words = (op.operationId ?? `${op.method.toLowerCase()} ${op.path.replace(PATH_PARAM, 'by $1')}`)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('').slice(0, 40);
  if (!/^[A-Za-z]/.test(base)) base = 'api' + base;
  if (!SOURCE_NAME.test(base)) base = 'api';
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}${n}`;
  return name;
}

/** Internal reference (`#/components/...`, `#/definitions/...`) resolved; external references are not followed. */
function resolve(root: JsonObject, value: Json | undefined, seen = 0): Json | undefined {
  if (!isObject(value) || typeof value['$ref'] !== 'string') return value;
  if (seen > 20 || !value['$ref'].startsWith('#/')) return undefined;
  let target: Json | undefined = root;
  for (const part of value['$ref'].slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    target = isObject(target) ? target[key] : undefined;
  }
  return resolve(root, target, seen + 1);
}

function serverPath(servers: Json | undefined): string {
  const first = Array.isArray(servers) && isObject(servers[0]) ? text(servers[0]['url']) : '';
  if (!first) return '';
  try {
    return cleanBase(new URL(first, 'http://localhost').pathname);
  } catch {
    return '';
  }
}

/** Prefix without trailing slash and with the leading one; empty if it is only «/» or contains unexpected characters. */
function cleanBase(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withSlash = trimmed.startsWith('/') ? trimmed : '/' + trimmed;
  return SAFE_PATH.test(withSlash) && !withSlash.includes('{') ? withSlash : '';
}

function text(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}
