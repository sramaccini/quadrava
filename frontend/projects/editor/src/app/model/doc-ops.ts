/**
 * Pure operations on the screen document. The document is never changed in place: every operation
 * returns a copy in which only the objects on the touched path changed (the undo history
 * thus keeps the previous versions without copying them whole).
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
/** Path from the root of the document, for example `['components', 0, 'tabs', 1, 'components', 2]`. */
export type Path = (string | number)[];

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getIn(doc: Json, path: Path): Json | undefined {
  let current: Json | undefined = doc;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') current = current[key];
    else if (isObject(current) && typeof key === 'string') current = current[key];
    else return undefined;
  }
  return current;
}

/** Sets a value; `undefined` removes the property (in objects). Missing objects on the path are created. */
export function setIn(doc: Json, path: Path, value: Json | undefined): Json {
  if (path.length === 0) return value ?? null;
  const [key, ...rest] = path;
  if (typeof key === 'number') {
    const list = Array.isArray(doc) ? [...doc] : [];
    const next = setIn(list[key] ?? null, rest, value);
    list[key] = next;
    return list;
  }
  const object: JsonObject = isObject(doc) ? { ...doc } : {};
  if (rest.length === 0 && value === undefined) {
    delete object[key];
    return object;
  }
  object[key] = setIn(object[key] ?? null, rest, value);
  return object;
}

/** Inserts `item` into the list at `listPath` at position `index` (at the end if out of bounds). */
export function insertAt(doc: Json, listPath: Path, index: number, item: Json): Json {
  const list = getIn(doc, listPath);
  const items = Array.isArray(list) ? [...list] : [];
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
  return setIn(doc, listPath, items);
}

/** Removes the element at `path` (the last step must be an index). */
export function removeAt(doc: Json, path: Path): Json {
  const index = path.at(-1);
  if (typeof index !== 'number') return doc;
  const listPath = path.slice(0, -1);
  const list = getIn(doc, listPath);
  if (!Array.isArray(list)) return doc;
  return setIn(doc, listPath, list.filter((_, i) => i !== index));
}

/** Moves the element at `path` by `delta` positions in the same list. Returns the document and the new path. */
export function moveBy(doc: Json, path: Path, delta: number): { doc: Json; path: Path } {
  const index = path.at(-1);
  const listPath = path.slice(0, -1);
  const list = getIn(doc, listPath);
  if (typeof index !== 'number' || !Array.isArray(list)) return { doc, path };
  const target = index + delta;
  if (target < 0 || target >= list.length) return { doc, path };
  const items = [...list];
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
  return { doc: setIn(doc, listPath, items), path: [...listPath, target] };
}

/**
 * Moves the element at `from` into the list `toList` at position `index` (also in another container).
 * Refuses to move a node into itself. Returns the new path of the element.
 */
export function moveTo(doc: Json, from: Path, toList: Path, index: number): { doc: Json; path: Path } | null {
  if (startsWith(toList, from)) return null;
  const item = getIn(doc, from);
  if (item === undefined) return null;
  const fromList = from.slice(0, -1);
  const fromIndex = from.at(-1) as number;
  let target = index;
  // Same list: after the removal the following positions shift by one.
  if (samePath(fromList, toList) && fromIndex < index) target -= 1;
  // Nested list further on in the same starting list: its index shifts if the removed node preceded it.
  const adjusted = [...toList];
  if (startsWith(toList, fromList) && toList.length > fromList.length) {
    const position = adjusted[fromList.length];
    if (typeof position === 'number' && position > fromIndex) adjusted[fromList.length] = position - 1;
  }
  const without = removeAt(doc, from);
  const list = getIn(without, adjusted);
  const length = Array.isArray(list) ? list.length : 0;
  const clamped = Math.max(0, Math.min(target, length));
  return { doc: insertAt(without, adjusted, clamped, item), path: [...adjusted, clamped] };
}

export function samePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

export function startsWith(path: Path, prefix: Path): boolean {
  return prefix.length <= path.length && prefix.every((key, i) => path[i] === key);
}

/** Path in JSON Pointer form (`/components/0/text`), as in the validation messages. */
export function toPointer(path: Path): string {
  return path.length ? '/' + path.map((k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1')).join('/') : '/';
}

export function fromPointer(pointer: string): Path {
  if (!pointer || pointer === '/') return [];
  return pointer
    .replace(/^\//, '')
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}
