import { SCREEN_SCHEMA } from 'schema';
import { getIn, isObject, type Json, type Path } from './doc-ops';

/**
 * Lettura dello schema delle schermate: quali proprietà ha ogni tipo di nodo e come modificarle. L'editor non tiene
 * un elenco proprio dei componenti: tutto viene dallo schema, così un componente nuovo compare da solo nell'editor
 * (con un modello iniziale da aggiungere in `templates.ts`).
 */

export type Schema = Record<string, unknown>;

/** Come si modifica una proprietà nell'inspector. */
export type PropertyKind = 'text' | 'expression' | 'enum' | 'boolean' | 'number' | 'json' | 'children' | 'object' | 'list';

export interface PropertyInfo {
  name: string;
  kind: PropertyKind;
  required: boolean;
  description?: string;
  options?: string[];
  minimum?: number;
  maximum?: number;
  /** Formato atteso per i testi con vincoli (identificativi, permessi, percorsi nello stato). */
  pattern?: string;
  /** Schema della proprietà, per leggere su richiesta i campi di un oggetto o degli elementi di un elenco. */
  schema?: Schema;
}

/** Una variante di un elenco con elementi di forme diverse (i passi: `call`, `toast`…), riconosciuta dalla sua chiave. */
export interface Variant {
  key: string;
  fields: PropertyInfo[];
}

/** Gli elementi di un elenco: una sola forma con i suoi campi, oppure più varianti. */
export type ItemShape = { fields: PropertyInfo[] } | { variants: Variant[] };

const root = SCREEN_SCHEMA as unknown as Schema;
const defs = root['$defs'] as Record<string, Schema>;
const nodeDef = defs['node'];

function resolve(schema: Schema): { schema: Schema; ref?: string } {
  const ref = schema['$ref'];
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const name = ref.slice('#/$defs/'.length);
    // Le proprietà accanto a $ref (description) valgono sopra quelle della definizione.
    const { $ref: _, ...rest } = schema;
    return { schema: { ...resolve(defs[name]).schema, ...rest }, ref: name };
  }
  return { schema };
}

function kindOf(schema: Schema): Omit<PropertyInfo, 'name' | 'required'> {
  const { schema: s, ref } = resolve(schema);
  const description = typeof s['description'] === 'string' ? (s['description'] as string) : undefined;
  if (Array.isArray(s['enum'])) return { kind: 'enum', options: (s['enum'] as unknown[]).map(String), description };
  if (ref === 'expression') return { kind: 'expression', description };
  if (s['type'] === 'string') return { kind: 'text', description, pattern: typeof s['pattern'] === 'string' ? (s['pattern'] as string) : undefined };
  if (s['type'] === 'boolean') return { kind: 'boolean', description };
  if (s['type'] === 'integer' || s['type'] === 'number') {
    return { kind: 'number', description, minimum: s['minimum'] as number | undefined, maximum: s['maximum'] as number | undefined };
  }
  if (s['type'] === 'array' && isObject(s['items'] as Json)) {
    const items = s['items'] as Schema;
    if (items['$ref'] === '#/$defs/node') return { kind: 'children', description };
    if (isListable(items)) return { kind: 'list', description, schema: s, minimum: s['minItems'] as number | undefined, maximum: s['maxItems'] as number | undefined };
  }
  // Oggetti con campi noti (non mappe libere come `params` o `badges`): un gruppo di campi.
  if (shapeOf(s)?.closed) return { kind: 'object', description, schema: s };
  return { kind: 'json', description };
}

interface Shape {
  properties: Record<string, Schema>;
  required: string[];
  /** Niente proprietà oltre a quelle elencate: si può modificare campo per campo. */
  closed: boolean;
}

/** Proprietà di uno schema oggetto, seguendo `$ref` e `allOf` (le colonne ereditano da più definizioni). */
function shapeOf(schema: Schema): Shape | null {
  let properties: Record<string, Schema> = {};
  let required: string[] = [];
  let closed = schema['additionalProperties'] === false || schema['unevaluatedProperties'] === false;
  let found = false;
  const ref = schema['$ref'];
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    const base = shapeOf(defs[ref.slice('#/$defs/'.length)]);
    if (base) {
      properties = { ...base.properties };
      required = [...base.required];
      closed ||= base.closed;
      found = true;
    }
  }
  if (isObject(schema['properties'] as Json)) {
    properties = { ...properties, ...(schema['properties'] as Record<string, Schema>) };
    found = true;
  }
  if (Array.isArray(schema['required'])) required = [...new Set([...required, ...(schema['required'] as string[])])];
  return found && Object.keys(properties).length ? { properties, required, closed } : null;
}

/** Gli elementi hanno una forma modificabile campo per campo? (Senza descriverli: i passi contengono altri passi.) */
function isListable(items: Schema): boolean {
  const { schema: resolved } = resolve(items);
  if (Array.isArray(resolved['oneOf'])) return (resolved['oneOf'] as Schema[]).every((option) => (shapeOf(option)?.required.length ?? 0) > 0);
  return shapeOf(items)?.closed ?? false;
}

function itemShapeOf(items: Schema): ItemShape | null {
  const { schema: resolved } = resolve(items);
  if (Array.isArray(resolved['oneOf'])) {
    const variants = (resolved['oneOf'] as Schema[]).map((option) => {
      const shape = shapeOf(option);
      return shape && shape.required.length ? { key: shape.required[0], fields: describeProperties(shape.properties, shape.required) } : null;
    });
    return variants.every((v) => v !== null) ? { variants: variants as Variant[] } : null;
  }
  const shape = shapeOf(items);
  return shape?.closed ? { fields: describeProperties(shape.properties, shape.required) } : null;
}

/** I campi di una proprietà di tipo `object`. */
export function objectFields(info: PropertyInfo): PropertyInfo[] {
  const shape = info.schema ? shapeOf(info.schema) : null;
  return shape ? describeProperties(shape.properties, shape.required) : [];
}

/** La forma degli elementi di una proprietà di tipo `list`. */
export function listItem(info: PropertyInfo): ItemShape | null {
  const items = info.schema?.['items'];
  return isObject(items as Json) ? itemShapeOf(items as Schema) : null;
}

function describeProperties(properties: Record<string, Schema>, required: string[]): PropertyInfo[] {
  return Object.entries(properties).map(([name, schema]) => ({ name, required: required.includes(name), ...kindOf(schema) }));
}

/** Tipi di nodo previsti dallo schema, nell'ordine dello schema. */
export const NODE_TYPES: string[] = ((nodeDef['properties'] as Record<string, Schema>)['type']['enum'] as string[]).slice();

/** Proprietà comuni a tutti i nodi (escluso `type`). */
const COMMON = describeProperties(nodeDef['properties'] as Record<string, Schema>, []).filter((p) => p.name !== 'type');

const BY_TYPE = new Map<string, PropertyInfo[]>(
  (nodeDef['allOf'] as Schema[]).map((branch) => {
    const type = ((branch['if'] as Schema)['properties'] as Record<string, Schema>)['type']['const'] as string;
    const then = branch['then'] as Schema;
    return [type, describeProperties((then['properties'] ?? {}) as Record<string, Schema>, (then['required'] ?? []) as string[])];
  }),
);

/** Proprietà di un tipo di nodo: `id`, poi quelle proprie del tipo, poi condizioni e tooltip. */
export function nodeProperties(type: string): PropertyInfo[] {
  const own = BY_TYPE.get(type) ?? [];
  const [id, ...rest] = COMMON;
  return [id, ...own, ...rest];
}

/** Proprietà di una definizione dello schema (`tab`, `wizardStep`, `dataSource`…). */
export function definitionProperties(name: string): PropertyInfo[] {
  const def = defs[name];
  return describeProperties((def['properties'] ?? {}) as Record<string, Schema>, (def['required'] ?? []) as string[]);
}

/** Proprietà della schermata, escluse quelle con un editor dedicato (`components`, `dataSources`). */
export function screenProperties(): PropertyInfo[] {
  const props = describeProperties(root['properties'] as Record<string, Schema>, root['required'] as string[]);
  const order = ['screen', 'title', 'description', 'requires', 'schemaVersion'];
  return order.map((name) => props.find((p) => p.name === name)!).filter(Boolean);
}

/** Che cosa c'è a un percorso del documento, dal punto di vista dell'editor. */
export type Target =
  | { kind: 'screen' }
  | { kind: 'node'; type: string }
  | { kind: 'tab' }
  | { kind: 'step' };

export function targetAt(doc: Json, path: Path): Target | null {
  if (path.length === 0) return { kind: 'screen' };
  const value = getIn(doc, path);
  const listKey = path.at(-2);
  if (!isObject(value) || typeof path.at(-1) !== 'number') return null;
  if (listKey === 'components' && typeof value['type'] === 'string') return { kind: 'node', type: value['type'] };
  const owner = getIn(doc, path.slice(0, -2));
  if (listKey === 'tabs' && isObject(owner) && owner['type'] === 'tabs') return { kind: 'tab' };
  if (listKey === 'steps' && isObject(owner) && owner['type'] === 'wizard') return { kind: 'step' };
  return null;
}

/** L'elemento selezionabile più vicino che contiene il percorso (per collegare un errore al nodo giusto). */
export function ownerOf(doc: Json, path: Path): Path {
  for (let end = path.length; end > 0; end--) {
    const candidate = path.slice(0, end);
    if (targetAt(doc, candidate)) return candidate;
  }
  return [];
}

/** Un elenco di nodi dentro un elemento: dove si possono aggiungere figli. */
export interface ChildSlot {
  /** Percorso dell'elenco (`[…, 'components']`). */
  path: Path;
  /** Elementi intermedi (schede, passi) da mostrare nella struttura: il loro percorso. */
  owner?: Path;
}

/** Elenchi di figli di un elemento: la schermata e le sezioni hanno `components`, schede e passi i propri. */
export function childSlots(doc: Json, path: Path): ChildSlot[] {
  const target = targetAt(doc, path);
  const value = getIn(doc, path);
  if (!target || !isObject(value)) return [];
  if (target.kind === 'screen' || target.kind === 'tab' || target.kind === 'step') return [{ path: [...path, 'components'] }];
  if (target.type === 'section') return [{ path: [...path, 'components'] }];
  if (target.type === 'table' && isObject(value['expand'])) return [{ path: [...path, 'expand', 'components'] }];
  return [];
}

/** Gli elementi intermedi di un nodo (le schede di `tabs`, i passi di `wizard`). */
export function containerItems(doc: Json, path: Path): Path[] {
  const value = getIn(doc, path);
  if (!isObject(value)) return [];
  const key = value['type'] === 'tabs' ? 'tabs' : value['type'] === 'wizard' ? 'steps' : null;
  if (!key || !Array.isArray(value[key])) return [];
  return (value[key] as Json[]).map((_, i) => [...path, key, i]);
}

