import { SCREEN_SCHEMA } from 'schema';
import { getIn, isObject, type Json, type Path } from './doc-ops';

/**
 * Lettura degli schemi JSON: quali proprietà ha ogni tipo di nodo (o voce del menu) e come modificarle. L'editor non tiene
 * un elenco proprio dei componenti: tutto viene dallo schema, così un componente nuovo compare da solo nell'editor
 * (con un modello iniziale da aggiungere in `templates.ts`).
 */

export type Schema = Record<string, unknown>;

/** Come si modifica una proprietà nell'inspector. */
export type PropertyKind = 'text' | 'color' | 'expression' | 'enum' | 'boolean' | 'number' | 'json' | 'children' | 'object' | 'list';

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
  /** Lo schema (schermate, navigazione…) da cui viene la proprietà. */
  reader?: SchemaReader;
}

/** Una variante di un elenco con elementi di forme diverse (i passi: `call`, `toast`…), riconosciuta dalla sua chiave. */
export interface Variant {
  key: string;
  fields: PropertyInfo[];
}

/** Gli elementi di un elenco: una sola forma con i suoi campi, oppure più varianti. */
export type ItemShape = { fields: PropertyInfo[] } | { variants: Variant[] };

interface Shape {
  properties: Record<string, Schema>;
  required: string[];
  /** Niente proprietà oltre a quelle elencate: si può modificare campo per campo. */
  closed: boolean;
}

/**
 * Lettore di uno schema JSON (schermate, navigazione…): descrive le proprietà di oggetti, elenchi e varianti
 * seguendo `$ref` e le definizioni dello schema stesso.
 */
export class SchemaReader {
  readonly defs: Record<string, Schema>;

  constructor(readonly root: Schema) {
    this.defs = (root['$defs'] ?? {}) as Record<string, Schema>;
  }

  private resolve(schema: Schema): { schema: Schema; ref?: string } {
    const ref = schema['$ref'];
    if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
      const name = ref.slice('#/$defs/'.length);
      // Le proprietà accanto a $ref (description) valgono sopra quelle della definizione.
      const { $ref: _, ...rest } = schema;
      return { schema: { ...this.resolve(this.defs[name]).schema, ...rest }, ref: name };
    }
    return { schema };
  }

  private kindOf(schema: Schema): Omit<PropertyInfo, 'name' | 'required'> {
    const { schema: s, ref } = this.resolve(schema);
    const description = typeof s['description'] === 'string' ? (s['description'] as string) : undefined;
    if (Array.isArray(s['enum'])) return { kind: 'enum', options: (s['enum'] as unknown[]).map(String), description };
    // Un valore fisso (per esempio la versione dello schema) è una scelta con una sola opzione.
    if (typeof s['const'] === 'string') return { kind: 'enum', options: [s['const'] as string], description };
    if (ref === 'expression') return { kind: 'expression', description };
    if (ref === 'color') return { kind: 'color', description, pattern: typeof s['pattern'] === 'string' ? (s['pattern'] as string) : undefined };
    if (s['type'] === 'string') return { kind: 'text', description, pattern: typeof s['pattern'] === 'string' ? (s['pattern'] as string) : undefined };
    if (s['type'] === 'boolean') return { kind: 'boolean', description };
    if (s['type'] === 'integer' || s['type'] === 'number') {
      return { kind: 'number', description, minimum: s['minimum'] as number | undefined, maximum: s['maximum'] as number | undefined };
    }
    if (s['type'] === 'array' && isObject(s['items'] as Json)) {
      const items = s['items'] as Schema;
      if (items['$ref'] === '#/$defs/node') return { kind: 'children', description };
      if (this.isListable(items)) return { kind: 'list', description, schema: s, reader: this, minimum: s['minItems'] as number | undefined, maximum: s['maxItems'] as number | undefined };
    }
    // Oggetti con campi noti (non mappe libere come `params` o `badges`): un gruppo di campi.
    if (this.shapeOf(s)?.closed) return { kind: 'object', description, schema: s, reader: this };
    return { kind: 'json', description };
  }

  /** Proprietà di uno schema oggetto, seguendo `$ref` (le colonne ereditano da più definizioni). */
  private shapeOf(schema: Schema): Shape | null {
    let properties: Record<string, Schema> = {};
    let required: string[] = [];
    let closed = schema['additionalProperties'] === false || schema['unevaluatedProperties'] === false;
    let found = false;
    const ref = schema['$ref'];
    if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
      const base = this.shapeOf(this.defs[ref.slice('#/$defs/'.length)]);
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

  /** Le alternative di uno schema `oneOf` / `anyOf` (i passi, le voci del menu), o null. */
  private alternatives(items: Schema): Schema[] | null {
    const { schema: resolved } = this.resolve(items);
    const options = resolved['oneOf'] ?? resolved['anyOf'];
    return Array.isArray(options) ? (options as Schema[]) : null;
  }

  /** Gli elementi hanno una forma modificabile campo per campo? (Senza descriverli: i passi contengono altri passi.) */
  private isListable(items: Schema): boolean {
    const options = this.alternatives(items);
    if (options) return options.every((option) => (this.shapeOf(option)?.required.length ?? 0) > 0);
    return this.shapeOf(items)?.closed ?? false;
  }

  private itemShapeOf(items: Schema): ItemShape | null {
    const options = this.alternatives(items);
    if (options) {
      const shapes = options.map((option) => this.shapeOf(option));
      if (shapes.some((shape) => !shape)) return null;
      // La chiave di una variante: la prima proprietà obbligatoria che non tutte le varianti hanno
      // (`call`, `toast`… per i passi; `screen` o `children` per le voci del menu).
      const common = (key: string): boolean => shapes.every((shape) => shape!.required.includes(key));
      const variants = shapes.map((shape) => {
        const key = shape!.required.find((k) => !common(k)) ?? shape!.required[0];
        return key ? { key, fields: this.describe(shape!.properties, shape!.required) } : null;
      });
      return variants.every((v) => v !== null) ? { variants: variants as Variant[] } : null;
    }
    const shape = this.shapeOf(items);
    return shape?.closed ? { fields: this.describe(shape.properties, shape.required) } : null;
  }

  /** I campi di una proprietà di tipo `object`. */
  objectFields(info: PropertyInfo): PropertyInfo[] {
    const shape = info.schema ? this.shapeOf(info.schema) : null;
    return shape ? this.describe(shape.properties, shape.required) : [];
  }

  /** La forma degli elementi di una proprietà di tipo `list`. */
  listItem(info: PropertyInfo): ItemShape | null {
    const items = info.schema?.['items'];
    return isObject(items as Json) ? this.itemShapeOf(items as Schema) : null;
  }

  describe(properties: Record<string, Schema>, required: string[]): PropertyInfo[] {
    return Object.entries(properties).map(([name, schema]) => ({ name, required: required.includes(name), ...this.kindOf(schema) }));
  }

  /** Proprietà di una definizione dello schema (`tab`, `wizardStep`, `useCase`…), seguendo `$ref`. */
  definitionProperties(name: string): PropertyInfo[] {
    const shape = this.shapeOf(this.defs[name]);
    return shape ? this.describe(shape.properties, shape.required) : [];
  }

  /** Proprietà della radice del documento. */
  rootProperties(): PropertyInfo[] {
    return this.describe((this.root['properties'] ?? {}) as Record<string, Schema>, (this.root['required'] ?? []) as string[]);
  }
}

/** Lo schema delle schermate. */
export const SCREEN = new SchemaReader(SCREEN_SCHEMA as unknown as Schema);
const root = SCREEN.root;
const defs = SCREEN.defs;
const nodeDef = defs['node'];
const describeProperties = (properties: Record<string, Schema>, required: string[]): PropertyInfo[] => SCREEN.describe(properties, required);

/** I campi di una proprietà di tipo `object` (nello schema da cui viene la proprietà). */
export function objectFields(info: PropertyInfo): PropertyInfo[] {
  return (info.reader ?? SCREEN).objectFields(info);
}

/** La forma degli elementi di una proprietà di tipo `list` (nello schema da cui viene la proprietà). */
export function listItem(info: PropertyInfo): ItemShape | null {
  return (info.reader ?? SCREEN).listItem(info);
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

/** Proprietà di una definizione dello schema delle schermate (`tab`, `wizardStep`, `dataSource`…). */
export function definitionProperties(name: string): PropertyInfo[] {
  return SCREEN.definitionProperties(name);
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

