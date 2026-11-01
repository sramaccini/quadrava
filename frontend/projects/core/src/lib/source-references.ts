export interface SourceReference {
  /** Path of the property that names the data source, inside the screen (for example `['components', 0, 'source']`). */
  path: (string | number)[];
  /** The name, which must be one of the `dataSources` of the screen. */
  name: string;
}

/** Objects whose `source` names a data source of the screen: fields, boards, forms, comments, exports. */
const NESTED = new Set(['lookup', 'suggest', 'columnsFrom', 'fieldsFrom', 'mentions', 'export']);
/** Properties whose value is the name of a data source: steps and remote rules. */
const NAMED = new Set(['call', 'refresh', 'remote']);

/**
 * Every place where a screen names one of its data sources: the `source` of the components, of the nested parts that
 * read data (`lookup`, `suggest`, `columnsFrom`, `fieldsFrom`, `mentions`, `export`), the `call` and `refresh` steps,
 * the `remote` rules and the `upload` of file fields. Used by Studio and by `quadrava validate`; it runs nothing.
 */
export function sourceReferences(screen: unknown): SourceReference[] {
  const found: SourceReference[] = [];
  const visit = (value: unknown, path: (string | number)[], key: string | number | null): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, [...path, i], i));
    if (value === null || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (typeof node['source'] === 'string' && (typeof node['type'] === 'string' || (typeof key === 'string' && NESTED.has(key)))) {
      found.push({ path: [...path, 'source'], name: node['source'] });
    }
    for (const name of NAMED) if (typeof node[name] === 'string') found.push({ path: [...path, name], name: node[name] as string });
    if (node['type'] === 'file' && typeof node['upload'] === 'string') found.push({ path: [...path, 'upload'], name: node['upload'] });
    for (const [k, child] of Object.entries(node)) {
      // The data sources themselves are not references; a screen has them only at the top.
      if (k === 'dataSources' && path.length === 0) continue;
      visit(child, [...path, k], k);
    }
  };
  visit(screen, [], null);
  return found;
}

/** The references to data sources the screen does not declare in `dataSources`. */
export function unknownSourceReferences(screen: unknown): SourceReference[] {
  const sources = screen !== null && typeof screen === 'object' ? (screen as Record<string, unknown>)['dataSources'] : undefined;
  const names = new Set(sources !== null && typeof sources === 'object' && !Array.isArray(sources) ? Object.keys(sources) : []);
  return sourceReferences(screen).filter((r) => !names.has(r.name));
}
