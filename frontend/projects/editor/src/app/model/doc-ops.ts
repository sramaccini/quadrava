/**
 * Operazioni pure sul documento della schermata. Il documento non si modifica mai sul posto: ogni operazione
 * restituisce una copia in cui sono cambiati solo gli oggetti sul percorso toccato (la cronologia degli annullamenti
 * conserva così le versioni precedenti senza copiarle per intero).
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
/** Percorso dalla radice del documento, per esempio `['components', 0, 'tabs', 1, 'components', 2]`. */
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

/** Imposta un valore; `undefined` toglie la proprietà (negli oggetti). Gli oggetti mancanti sul percorso vengono creati. */
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

/** Inserisce `item` nell'elenco in `listPath` alla posizione `index` (in fondo se fuori dai limiti). */
export function insertAt(doc: Json, listPath: Path, index: number, item: Json): Json {
  const list = getIn(doc, listPath);
  const items = Array.isArray(list) ? [...list] : [];
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
  return setIn(doc, listPath, items);
}

/** Toglie l'elemento in `path` (l'ultimo passo deve essere un indice). */
export function removeAt(doc: Json, path: Path): Json {
  const index = path.at(-1);
  if (typeof index !== 'number') return doc;
  const listPath = path.slice(0, -1);
  const list = getIn(doc, listPath);
  if (!Array.isArray(list)) return doc;
  return setIn(doc, listPath, list.filter((_, i) => i !== index));
}

/** Sposta l'elemento in `path` di `delta` posizioni nello stesso elenco. Restituisce il documento e il nuovo percorso. */
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
 * Sposta l'elemento in `from` dentro l'elenco `toList` alla posizione `index` (anche in un altro contenitore).
 * Rifiuta lo spostamento di un nodo dentro sé stesso. Restituisce il nuovo percorso dell'elemento.
 */
export function moveTo(doc: Json, from: Path, toList: Path, index: number): { doc: Json; path: Path } | null {
  if (startsWith(toList, from)) return null;
  const item = getIn(doc, from);
  if (item === undefined) return null;
  const fromList = from.slice(0, -1);
  const fromIndex = from.at(-1) as number;
  let target = index;
  // Stesso elenco: dopo la rimozione le posizioni successive scalano di uno.
  if (samePath(fromList, toList) && fromIndex < index) target -= 1;
  // Elenco annidato più avanti nello stesso elenco di partenza: il suo indice scala se il nodo tolto lo precedeva.
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

/** Percorso in forma di JSON Pointer (`/components/0/text`), come nei messaggi di validazione. */
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
