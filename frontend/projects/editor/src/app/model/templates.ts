import { getIn, isObject, type Json, type JsonObject } from './doc-ops';
import { listItem, type PropertyInfo } from './schema-info';

/**
 * Initial templates of the nodes added from the palette: the minimum valid for the schema, with placeholder texts in
 * the language of the editor (`text` translates the key). A test checks that every type of the schema has a valid template.
 */

type Translate = (key: string) => string;

/** Name of the data source the template expects (referred to when the project has one with that name, see `ensureSource`). */
export const TEMPLATE_SOURCES: Record<string, string> = {
  table: 'list',
  dataTable: 'list',
  serverDataTable: 'search',
  detail: 'detail',
  tree: 'tree',
  calendar: 'events',
  chart: 'series',
  timeline: 'events',
  kanban: 'tasks',
};

/** Field types the palette offers as standalone `input` components (item `input.<type>`). */
export const INPUT_KINDS = ['text', 'textarea', 'richtext', 'password', 'number', 'select', 'multiselect', 'radio', 'checkbox', 'switch', 'date', 'datetime', 'lookup', 'file'] as const;

/** Initial name of the field of an `input`, by type (made unique in the screen by `uniqueInputName`). */
const INPUT_NAMES: Record<string, string> = {
  text: 'text', textarea: 'notes', number: 'number', select: 'choice', multiselect: 'choices', radio: 'option',
  checkbox: 'confirmed', switch: 'active', date: 'date', datetime: 'moment', lookup: 'customer', file: 'attachment', richtext: 'description', password: 'password',
};

/** The starting field of an `input` of the given type. */
function inputField(kind: string, label: string): JsonObject {
  const field: JsonObject = { name: INPUT_NAMES[kind] ?? 'value', type: kind, label };
  if (kind === 'select' || kind === 'multiselect' || kind === 'radio') field['options'] = ['option1', 'option2', 'option3'];
  if (kind === 'lookup') field['lookup'] = { source: 'customers', labelField: 'name' };
  return field;
}

/**
 * Template of a node. `kind` is a type of the schema or `input.<field type>` for the palette items that
 * add a standalone field (text box, drop-down list…).
 */
export function nodeTemplate(kind: string, t: Translate): JsonObject {
  const [type, variant] = kind.split('.');
  const source = TEMPLATE_SOURCES[type];
  const label = t('ed.tpl.label');
  switch (type) {
    case 'section':
      return { type, title: t('ed.tpl.section'), components: [] };
    case 'box':
      return { type, direction: 'row', components: [] };
    case 'grid':
      return { type, columns: 2, components: [] };
    case 'border':
      // With three regions already filled in, so one sees at once how it works; the others come by changing `region`.
      return {
        type,
        components: [
          { type: 'text', region: 'north', style: 'heading', text: t('ed.tpl.north') },
          { type: 'text', region: 'west', text: t('ed.tpl.west') },
          { type: 'text', region: 'center', text: t('ed.tpl.center') },
        ],
      };
    case 'text':
      // `text.markdown`: formatted text, with an example of a list and bold to edit.
      return variant === 'markdown' ? { type, format: 'markdown', text: t('ed.tpl.markdown') } : { type, text: t('ed.tpl.text') };
    case 'button':
      return { type, label: t('ed.tpl.button'), onClick: [{ toast: t('ed.tpl.clicked') }] };
    case 'alert':
      return { type, kind: 'info', text: t('ed.tpl.alert') };
    case 'filterBar':
      return { type, bind: 'state.filters', fields: [{ name: 'text', type: 'text', label: t('ed.tpl.search') }] };
    case 'table':
      return { type, source, columns: [{ field: 'id', label: 'Id' }, { field: 'description', label }] };
    case 'dataTable':
    case 'serverDataTable':
      return { type, source, columns: [{ field: 'description', label, filter: 'text', sortable: true }] };
    case 'form':
      return { type, fields: [{ name: 'name', type: 'text', label, required: true }] };
    case 'tabs':
      return { type, tabs: [{ label: t('ed.tpl.tab') + ' 1', components: [] }, { label: t('ed.tpl.tab') + ' 2', components: [] }] };
    case 'detail':
      return { type, source, fields: [{ field: 'id', label: 'Id' }, { field: 'description', label }] };
    case 'stats':
      return { type, items: [{ label: t('ed.tpl.stat'), value: '{{ 0 }}', format: 'number' }] };
    case 'wizard':
      return { type, steps: [{ label: t('ed.tpl.step') + ' 1', components: [] }, { label: t('ed.tpl.step') + ' 2', components: [] }] };
    case 'tree':
      return { type, source, labelField: 'name' };
    case 'calendar':
      return { type, source, dateField: 'date', labelField: 'title' };
    case 'chart':
      return { type, kind: 'bar', source, categoryField: 'category', series: [{ field: 'value', label }] };
    case 'image':
      return { type, src: 'logo.svg', alt: t('ed.tpl.image') };
    case 'link':
      return { type, label: t('ed.tpl.link'), href: 'https://example.com' };
    case 'progress':
      return { type, value: 50, label: t('ed.tpl.progress') };
    case 'timeline':
      return { type, source, dateField: 'date', labelField: 'title' };
    case 'kanban':
      return {
        type,
        source,
        columnField: 'status',
        titleField: 'title',
        columns: [
          { value: 'to-do', label: t('ed.tpl.todo') },
          { value: 'done', label: t('ed.tpl.done') },
        ],
      };
    case 'input':
      return { type, field: inputField(variant ?? 'text', label) };
    default:
      return { type };
  }
}

/**
 * Adds to the screen a reference to the data source the node uses, if the screen does not have it yet and the project has a
 * data source with that name (`references`: those of the project, `document/name`). Otherwise the screen stays without it:
 * the issues flag the missing data source and «Use from the project» adds one. A screen never defines data sources.
 */
export function ensureSource(doc: Json, node: JsonObject, references: readonly string[] = []): Json {
  // The lookup of a standalone field searches a GET data source.
  const lookup = getIn(node, ['field', 'lookup', 'source']);
  const name = node['source'] ?? lookup;
  if (typeof name !== 'string' || !isObject(doc)) return doc;
  const sources = isObject(getIn(doc, ['dataSources'])) ? (doc['dataSources'] as JsonObject) : {};
  if (name in sources) return doc;
  const ref = references.find((r) => r.slice(r.indexOf('/') + 1) === name);
  return ref ? { ...doc, dataSources: { ...sources, [name]: { ref } } } : doc;
}

/** A new `input` with a field name no other `input` of the screen already uses (`text`, `text2`…). */
export function uniqueInputName(doc: Json, node: JsonObject): JsonObject {
  const field = node['field'];
  if (node['type'] !== 'input' || !isObject(field) || typeof field['name'] !== 'string' || node['bind'] !== undefined) return node;
  const used = new Set<string>();
  const visit = (value: Json): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isObject(value)) {
      if (value['type'] === 'input' && isObject(value['field']) && typeof value['field']['name'] === 'string') used.add(value['field']['name']);
      Object.values(value).forEach(visit);
    }
  };
  visit(doc);
  const base = field['name'];
  let name = base;
  for (let n = 2; used.has(name); n++) name = base + n;
  return name === base ? node : { ...node, field: { ...field, name } };
}

/** Free identifier for a new node: `type-n` in kebab-case, unique in the document. */
export function freshId(doc: Json, type: string): string {
  return nextId(usedIds(doc), type);
}

function nextId(used: Set<string>, type: string): string {
  const base = type.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

export function usedIds(value: Json, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => usedIds(v, into));
  else if (isObject(value)) {
    if (typeof value['id'] === 'string') into.add(value['id']);
    Object.values(value).forEach((v) => usedIds(v, into));
  }
  return into;
}

/** A copy of the node with new identifiers (for «Duplicate»), so the copy does not clash with the original. */
export function withFreshIds(doc: Json, node: Json): Json {
  const used = usedIds(doc);
  const visit = (value: Json): Json => {
    if (Array.isArray(value)) return value.map(visit);
    if (!isObject(value)) return value;
    const copy: JsonObject = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    if (typeof copy['id'] === 'string') copy['id'] = nextId(used, typeof copy['type'] === 'string' ? copy['type'] : copy['id'].replace(/-\d+$/, ''));
    return copy;
  };
  return visit(node);
}

/** Initial values for some recurring required properties of the elements of a list. */
const ITEM_DEFAULTS: Record<string, (index: number, t: Translate) => Json> = {
  name: (i) => `field${i + 1}`,
  field: (i) => `field${i + 1}`,
  label: (_, t) => t('ed.tpl.label'),
  title: (_, t) => t('ed.tpl.label'),
  // if step: a valid condition and a step in the then branch, to change.
  if: () => '{{ true }}',
  then: (_, t) => ({ toast: t('ed.tpl.clicked') }),
  // run step: a name to replace with a sequence of actions (reported until it exists).
  run: () => 'sequence',
  // CEL validation rule: a valid condition, to change.
  rule: () => '{{ value != null }}',
};

/**
 * A new element of a list (column, field, action, step…): the required properties with a plausible initial
 * value. Validation reports what is left to complete.
 */
export function defaultItem(fields: PropertyInfo[], index: number, t: Translate): JsonObject {
  const item: JsonObject = {};
  for (const info of fields) {
    if (!info.required && !(info.name === 'label' && fields.some((f) => f.name === 'field'))) continue;
    item[info.name] = defaultValue(info, index, t);
  }
  return item;
}

function defaultValue(info: PropertyInfo, index: number, t: Translate): Json {
  const preset = ITEM_DEFAULTS[info.name];
  if (preset) return preset(index, t);
  switch (info.kind) {
    case 'enum':
      return info.options?.[0] ?? '';
    case 'boolean':
      return info.fixed ?? false;
    case 'color':
      return '#000000';
    case 'number':
      return info.minimum ?? 0;
    case 'list': {
      // A list that must have at least one element starts with one (for steps: a message).
      if (!info.minimum) return [];
      const shape = listItem(info);
      if (!shape) return [];
      if ('fields' in shape) return [defaultItem(shape.fields, 0, t)];
      const variant = shape.variants.find((v) => v.key === 'toast') ?? shape.variants[0];
      return [defaultItem(variant.fields, 0, t)];
    }
    case 'children':
      return [];
    case 'object':
      return {};
    case 'json':
      return info.schema?.['type'] === 'array' ? [] : {};
    default:
      return '';
  }
}

/** Short text summing up an element of a list when it is closed: its label or field, or the step. */
export function summaryOf(item: Json, variantKey?: string): string {
  if (!isObject(item)) return typeof item === 'string' ? item : JSON.stringify(item);
  if (variantKey) {
    const value = item[variantKey];
    const text =
      typeof value === 'string'
        ? fallbackText(value)
        : typeof value === 'number'
          ? String(value)
          : Array.isArray(value)
            ? value.filter((v) => typeof v === 'string').join(', ')
            : isObject(value)
              ? summaryOf(value)
              : '';
    return text ? `${variantKey}: ${text}` : variantKey;
  }
  for (const key of ['label', 'title', 'field', 'name', 'id']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) {
      const extra = key === 'label' && typeof item['field'] === 'string' ? ` (${item['field']})` : key === 'name' && typeof item['type'] === 'string' ? ` · ${item['type']}` : '';
      return fallbackText(value) + extra;
    }
  }
  return '';
}

/** `t('key', 'Fallback')` expressions are summed up by the fallback; long texts are shortened. */
export function fallbackText(text: string): string {
  const quoted = /t\(\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(['"])((?:\\.|(?!\2).)*)\2/.exec(text);
  const fallback = quoted ? quoted[3].replace(/\\(.)/g, '$1') : null;
  const plain = (fallback ?? text).replace(/\s+/g, ' ').trim();
  return plain.length > 40 ? plain.slice(0, 39) + '…' : plain;
}

/** Screen identifier allowed by the schema (`$defs/id`): kebab-case of lower-case letters and digits. */
export const SCREEN_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Identifier derived from the title: kebab-case without accents, at most 60 characters; empty if nothing is left. */
export function screenIdFrom(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

/** Empty screen a new document starts from, with the chosen title and identifier (or the default ones). */
export function emptyScreen(t: Translate, title?: string, screen?: string): JsonObject {
  return { schemaVersion: '1.0', screen: screen || 'new-screen', title: title || t('ed.tpl.screenTitle'), dataSources: {}, components: [] };
}
