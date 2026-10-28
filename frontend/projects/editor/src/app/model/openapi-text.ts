/** The text is neither JSON nor YAML describing an object (for example the HTML page of Swagger UI). */
export class ApiTextError extends Error {
  constructor() {
    super('not JSON or YAML');
  }
}

/**
 * Reads the text of an OpenAPI or Swagger document, in JSON or in YAML (`swagger.yaml`, `openapi.yml`). The YAML library is
 * loaded only here, when a text is not JSON: Studio does not carry it from the start. YAML is read as plain data: the core
 * schema (no dates or other types made from text), no custom tags, a limited number of aliases (a document that expands to
 * a huge one is refused), no repeated keys.
 */
export async function parseApiText(raw: string): Promise<unknown> {
  // Without the byte order mark some editors put at the start.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: perhaps YAML.
  }
  // A page (Swagger UI, a login form) is neither.
  if (/^\s*</.test(text)) throw new ApiTextError();
  const { parse } = await import('yaml');
  let doc: unknown;
  try {
    doc = parse(text, { schema: 'core', maxAliasCount: 100, uniqueKeys: true });
  } catch {
    throw new ApiTextError();
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) throw new ApiTextError();
  return doc;
}
