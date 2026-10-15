import { SCREEN_SCHEMA } from 'schema';
import { getIn, isObject, type Json, type Path } from './doc-ops';

/**
 * Reading of the JSON schemas: which properties every node type (or menu item) has and how to edit them. The editor keeps
 * no list of components of its own: everything comes from the schema, so a new component appears in the editor by itself
 * (with an initial template to add in `templates.ts`).
 */

export type Schema = Record<string, unknown>;

/** How a property is edited in the inspector. */
export type PropertyKind = 'text' | 'color' | 'expression' | 'enum' | 'boolean' | 'number' | 'json' | 'children' | 'object' | 'list';

export interface PropertyInfo {
  name: string;
  kind: PropertyKind;
  required: boolean;
  description?: string;
  options?: string[];
  minimum?: number;
  maximum?: number;
  /** Expected format for constrained texts (identifiers, permissions, paths in the state). */
  pattern?: string;
  /** Schema of the property, to read on request the fields of an object or of the elements of a list. */
  schema?: Schema;
  /** The schema (screens, navigation…) the property comes from. */
  reader?: SchemaReader;
  /** Fixed value of a boolean (`const`, for example `print: true`): it is also the initial value. */
  fixed?: boolean;
}

/** A variant of a list with elements of different shapes (the steps: `call`, `toast`…), recognised by its key. */
export interface Variant {
  key: string;
  fields: PropertyInfo[];
}

/** The elements of a list: a single shape with its fields, or several variants. */
export type ItemShape = { fields: PropertyInfo[] } | { variants: Variant[] };

interface Shape {
  properties: Record<string, Schema>;
  required: string[];
  /** No properties beyond those listed: it can be edited field by field. */
  closed: boolean;
}

/**
 * Reader of a JSON schema (screens, navigation…): describes the properties of objects, lists and variants
 * following `$ref` and the definitions of the schema itself.
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
      // The properties next to $ref (description) win over those of the definition.
      const { $ref: _, ...rest } = schema;
      return { schema: { ...this.resolve(this.defs[name]).schema, ...rest }, ref: name };
    }
    return { schema };
  }

  private kindOf(schema: Schema): Omit<PropertyInfo, 'name' | 'required'> {
    const { schema: s, ref } = this.resolve(schema);
    const description = typeof s['description'] === 'string' ? (s['description'] as string) : undefined;
    if (Array.isArray(s['enum'])) return { kind: 'enum', options: (s['enum'] as unknown[]).map(String), description };
    // A fixed value (for example the schema version) is a choice with a single option.
    if (typeof s['const'] === 'string') return { kind: 'enum', options: [s['const'] as string], description };
    if (typeof s['const'] === 'boolean') return { kind: 'boolean', description, fixed: s['const'] as boolean };
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
    // Objects with known fields (not free maps such as `params` or `badges`): a group of fields.
    if (this.shapeOf(s)?.closed) return { kind: 'object', description, schema: s, reader: this };
    return { kind: 'json', description };
  }

  /** Properties of an object schema, following `$ref` (columns inherit from several definitions). */
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

  /** The alternatives of a `oneOf` / `anyOf` schema (the steps, the menu items), or null. */
  private alternatives(items: Schema): Schema[] | null {
    const { schema: resolved } = this.resolve(items);
    const options = resolved['oneOf'] ?? resolved['anyOf'];
    return Array.isArray(options) ? (options as Schema[]) : null;
  }

  /** Do the elements have a shape editable field by field? (Without describing them: steps contain other steps.) */
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
      // The key of a variant: the first required property that not all variants have
      // (`call`, `toast`… for steps; `screen` or `children` for menu items).
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

  /** The fields of a property of kind `object`. */
  objectFields(info: PropertyInfo): PropertyInfo[] {
    const shape = info.schema ? this.shapeOf(info.schema) : null;
    return shape ? this.describe(shape.properties, shape.required) : [];
  }

  /** The shape of the elements of a property of kind `list`. */
  listItem(info: PropertyInfo): ItemShape | null {
    const items = info.schema?.['items'];
    return isObject(items as Json) ? this.itemShapeOf(items as Schema) : null;
  }

  describe(properties: Record<string, Schema>, required: string[]): PropertyInfo[] {
    return Object.entries(properties).map(([name, schema]) => ({ name, required: required.includes(name), ...this.kindOf(schema) }));
  }

  /** Properties of a definition of the schema (`tab`, `wizardStep`, `area`…), following `$ref`. */
  definitionProperties(name: string): PropertyInfo[] {
    const shape = this.shapeOf(this.defs[name]);
    return shape ? this.describe(shape.properties, shape.required) : [];
  }

  /** Properties of the root of the document. */
  rootProperties(): PropertyInfo[] {
    return this.describe((this.root['properties'] ?? {}) as Record<string, Schema>, (this.root['required'] ?? []) as string[]);
  }
}

/** The screen schema. */
export const SCREEN = new SchemaReader(SCREEN_SCHEMA as unknown as Schema);
const root = SCREEN.root;
const defs = SCREEN.defs;
const nodeDef = defs['node'];
const describeProperties = (properties: Record<string, Schema>, required: string[]): PropertyInfo[] => SCREEN.describe(properties, required);

/** The fields of a property of kind `object` (in the schema the property comes from). */
export function objectFields(info: PropertyInfo): PropertyInfo[] {
  return (info.reader ?? SCREEN).objectFields(info);
}

/** The shape of the elements of a property of kind `list` (in the schema the property comes from). */
export function listItem(info: PropertyInfo): ItemShape | null {
  return (info.reader ?? SCREEN).listItem(info);
}

/** Node types foreseen by the schema, in the order of the schema. */
export const NODE_TYPES: string[] = ((nodeDef['properties'] as Record<string, Schema>)['type']['enum'] as string[]).slice();

/** Properties common to all nodes (except `type`). */
const COMMON = describeProperties(nodeDef['properties'] as Record<string, Schema>, []).filter((p) => p.name !== 'type');

const BY_TYPE = new Map<string, PropertyInfo[]>(
  (nodeDef['allOf'] as Schema[]).map((branch) => {
    const type = ((branch['if'] as Schema)['properties'] as Record<string, Schema>)['type']['const'] as string;
    const then = branch['then'] as Schema;
    return [type, describeProperties((then['properties'] ?? {}) as Record<string, Schema>, (then['required'] ?? []) as string[])];
  }),
);

/** Properties of a node type: `id`, then those of the type, then conditions and tooltip. */
export function nodeProperties(type: string): PropertyInfo[] {
  const own = BY_TYPE.get(type) ?? [];
  const [id, ...rest] = COMMON;
  return [id, ...own, ...rest];
}

/** Properties of a definition of the screen schema (`tab`, `wizardStep`, `dataSource`…). */
export function definitionProperties(name: string): PropertyInfo[] {
  return SCREEN.definitionProperties(name);
}

/** Properties of the screen, except those with a dedicated editor (`components`, `dataSources`). */
export function screenProperties(): PropertyInfo[] {
  const props = describeProperties(root['properties'] as Record<string, Schema>, root['required'] as string[]);
  const order = ['screen', 'title', 'description', 'requires', 'schemaVersion'];
  return order.map((name) => props.find((p) => p.name === name)!).filter(Boolean);
}

/** What there is at a path of the document, from the editor's point of view. */
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

/** The nearest selectable element containing the path (to link an error to the right node). */
export function ownerOf(doc: Json, path: Path): Path {
  for (let end = path.length; end > 0; end--) {
    const candidate = path.slice(0, end);
    if (targetAt(doc, candidate)) return candidate;
  }
  return [];
}

/** A list of nodes inside an element: where children can be added. */
export interface ChildSlot {
  /** Path of the list (`[…, 'components']`). */
  path: Path;
  /** Intermediate elements (tabs, steps) to show in the outline: their path. */
  owner?: Path;
}

/** Nodes containing other nodes in `components` (section and layout containers). */
const LAYOUT_CONTAINERS = new Set(['section', 'box', 'grid', 'border']);

/** Lists of children of an element: the screen and the sections have `components`, tabs and steps their own. */
export function childSlots(doc: Json, path: Path): ChildSlot[] {
  const target = targetAt(doc, path);
  const value = getIn(doc, path);
  if (!target || !isObject(value)) return [];
  if (target.kind === 'screen' || target.kind === 'tab' || target.kind === 'step') return [{ path: [...path, 'components'] }];
  if (LAYOUT_CONTAINERS.has(target.type)) return [{ path: [...path, 'components'] }];
  if (target.type === 'table' && isObject(value['expand'])) return [{ path: [...path, 'expand', 'components'] }];
  return [];
}

/** The intermediate elements of a node (the tabs of `tabs`, the steps of `wizard`). */
export function containerItems(doc: Json, path: Path): Path[] {
  const value = getIn(doc, path);
  if (!isObject(value)) return [];
  const key = value['type'] === 'tabs' ? 'tabs' : value['type'] === 'wizard' ? 'steps' : null;
  if (!key || !Array.isArray(value[key])) return [];
  return (value[key] as Json[]).map((_, i) => [...path, key, i]);
}

