import { getIn, isObject, type Json, type JsonObject } from './doc-ops';
import { listItem, type PropertyInfo } from './schema-info';

/**
 * Modelli iniziali dei nodi aggiunti dalla tavolozza: il minimo valido per lo schema, con testi segnaposto nella
 * lingua dell'editor (`text` traduce la chiave). Un test verifica che ogni tipo dello schema abbia un modello valido.
 */

type Translate = (key: string) => string;

/** Nome del data source che il modello si aspetta (creato se manca, vedi `ensureSource`). */
export const TEMPLATE_SOURCES: Record<string, { name: string; method: 'GET' | 'POST' }> = {
  table: { name: 'elenco', method: 'GET' },
  dataTable: { name: 'elenco', method: 'GET' },
  serverDataTable: { name: 'ricerca', method: 'POST' },
  detail: { name: 'dettaglio', method: 'GET' },
  tree: { name: 'albero', method: 'GET' },
  calendar: { name: 'eventi', method: 'GET' },
  chart: { name: 'serie', method: 'GET' },
  timeline: { name: 'eventi', method: 'GET' },
  kanban: { name: 'attivita', method: 'GET' },
};

/** Tipi di campo che la tavolozza offre come componenti `input` a sé (voce `input.<tipo>`). */
export const INPUT_KINDS = ['text', 'textarea', 'richtext', 'number', 'select', 'multiselect', 'radio', 'checkbox', 'switch', 'date', 'datetime', 'lookup', 'file'] as const;

/** Nome iniziale del campo di un `input`, per tipo (reso unico nella schermata da `uniqueInputName`). */
const INPUT_NAMES: Record<string, string> = {
  text: 'testo', textarea: 'note', number: 'numero', select: 'scelta', multiselect: 'scelte', radio: 'opzione',
  checkbox: 'conferma', switch: 'attivo', date: 'data', datetime: 'momento', lookup: 'cliente', file: 'allegato', richtext: 'descrizione',
};

/** Il campo di partenza di un `input` del tipo dato. */
function inputField(kind: string, label: string): JsonObject {
  const field: JsonObject = { name: INPUT_NAMES[kind] ?? 'valore', type: kind, label };
  if (kind === 'select' || kind === 'multiselect' || kind === 'radio') field['options'] = ['opzione1', 'opzione2', 'opzione3'];
  if (kind === 'lookup') field['lookup'] = { source: 'clienti', labelField: 'nome' };
  return field;
}

/**
 * Modello di un nodo. `kind` è un tipo dello schema oppure `input.<tipo di campo>` per le voci della tavolozza che
 * aggiungono un campo a sé (casella di testo, elenco a discesa…).
 */
export function nodeTemplate(kind: string, t: Translate): JsonObject {
  const [type, variant] = kind.split('.');
  const source = TEMPLATE_SOURCES[type]?.name;
  const label = t('ed.tpl.label');
  switch (type) {
    case 'section':
      return { type, title: t('ed.tpl.section'), components: [] };
    case 'box':
      return { type, direction: 'row', components: [] };
    case 'grid':
      return { type, columns: 2, components: [] };
    case 'border':
      // Con tre aree già indicate, così si vede subito come funziona; le altre si ottengono cambiando `region`.
      return {
        type,
        components: [
          { type: 'text', region: 'north', style: 'heading', text: t('ed.tpl.north') },
          { type: 'text', region: 'west', text: t('ed.tpl.west') },
          { type: 'text', region: 'center', text: t('ed.tpl.center') },
        ],
      };
    case 'text':
      // `text.markdown`: testo formattato, con un esempio di elenco e grassetto da modificare.
      return variant === 'markdown' ? { type, format: 'markdown', text: t('ed.tpl.markdown') } : { type, text: t('ed.tpl.text') };
    case 'button':
      return { type, label: t('ed.tpl.button'), onClick: [{ toast: t('ed.tpl.clicked') }] };
    case 'alert':
      return { type, kind: 'info', text: t('ed.tpl.alert') };
    case 'filterBar':
      return { type, bind: 'state.filtri', fields: [{ name: 'testo', type: 'text', label: t('ed.tpl.search') }] };
    case 'table':
      return { type, source, columns: [{ field: 'id', label: 'Id' }, { field: 'descrizione', label }] };
    case 'dataTable':
    case 'serverDataTable':
      return { type, source, columns: [{ field: 'descrizione', label, filter: 'text', sortable: true }] };
    case 'form':
      return { type, fields: [{ name: 'nome', type: 'text', label, required: true }] };
    case 'tabs':
      return { type, tabs: [{ label: t('ed.tpl.tab') + ' 1', components: [] }, { label: t('ed.tpl.tab') + ' 2', components: [] }] };
    case 'detail':
      return { type, source, fields: [{ field: 'id', label: 'Id' }, { field: 'descrizione', label }] };
    case 'stats':
      return { type, items: [{ label: t('ed.tpl.stat'), value: '{{ 0 }}', format: 'number' }] };
    case 'wizard':
      return { type, steps: [{ label: t('ed.tpl.step') + ' 1', components: [] }, { label: t('ed.tpl.step') + ' 2', components: [] }] };
    case 'tree':
      return { type, source, labelField: 'nome' };
    case 'calendar':
      return { type, source, dateField: 'data', labelField: 'titolo' };
    case 'chart':
      return { type, kind: 'bar', source, categoryField: 'categoria', series: [{ field: 'valore', label }] };
    case 'image':
      return { type, src: 'logo.svg', alt: t('ed.tpl.image') };
    case 'link':
      return { type, label: t('ed.tpl.link'), href: 'https://example.com' };
    case 'progress':
      return { type, value: 50, label: t('ed.tpl.progress') };
    case 'timeline':
      return { type, source, dateField: 'data', labelField: 'titolo' };
    case 'kanban':
      return {
        type,
        source,
        columnField: 'stato',
        titleField: 'titolo',
        columns: [
          { value: 'da-fare', label: t('ed.tpl.todo') },
          { value: 'fatto', label: t('ed.tpl.done') },
        ],
      };
    case 'input':
      return { type, field: inputField(variant ?? 'text', label) };
    default:
      return { type };
  }
}

/** Data source di partenza per un modello (`{{ request }}` per la datatable lato server). */
export function sourceTemplate(name: string, method: 'GET' | 'POST'): JsonObject {
  return method === 'POST' ? { type: 'rest', method, url: `/api/${name}`, body: '{{ request }}' } : { type: 'rest', method, url: `/api/${name}` };
}

/** Aggiunge al documento il data source che il nodo usa, se non esiste ancora. */
export function ensureSource(doc: Json, node: JsonObject): Json {
  // Il lookup di un campo a sé cerca in un data source GET.
  const lookup = getIn(node, ['field', 'lookup', 'source']);
  const name = node['source'] ?? lookup;
  if (typeof name !== 'string' || !isObject(doc)) return doc;
  const sources = isObject(getIn(doc, ['dataSources'])) ? (doc['dataSources'] as JsonObject) : {};
  if (name in sources) return doc;
  const method = TEMPLATE_SOURCES[String(node['type'])]?.method ?? 'GET';
  return { ...doc, dataSources: { ...sources, [name]: sourceTemplate(name, method) } };
}

/** Un `input` nuovo con un nome di campo che nessun altro `input` della schermata usa già (`testo`, `testo2`…). */
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

/** Identificativo libero per un nuovo nodo: `tipo-n` in kebab-case, unico nel documento. */
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

/** Una copia del nodo con identificativi nuovi (per «Duplica»), così la copia non va in conflitto con l'originale. */
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

/** Valori iniziali per alcune proprietà obbligatorie ricorrenti degli elementi di un elenco. */
const ITEM_DEFAULTS: Record<string, (index: number, t: Translate) => Json> = {
  name: (i) => `campo${i + 1}`,
  field: (i) => `campo${i + 1}`,
  label: (_, t) => t('ed.tpl.label'),
  title: (_, t) => t('ed.tpl.label'),
  // Passo if: una condizione valida e un passo nel ramo then, da cambiare.
  if: () => '{{ true }}',
  then: (_, t) => ({ toast: t('ed.tpl.clicked') }),
  // Passo run: un nome da sostituire con una sequenza di actions (finché non esiste è segnalato).
  run: () => 'sequenza',
};

/**
 * Un elemento nuovo di un elenco (colonna, campo, azione, passo…): le proprietà obbligatorie con un valore iniziale
 * plausibile. Quello che resta da completare lo segnala la validazione.
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
      // Un elenco che deve avere almeno un elemento nasce con uno (per i passi: un messaggio).
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
    case 'json':
      return {};
    default:
      return '';
  }
}

/** Testo breve che riassume un elemento di un elenco quando è chiuso: la sua etichetta o il campo, oppure il passo. */
export function summaryOf(item: Json, variantKey?: string): string {
  if (!isObject(item)) return typeof item === 'string' ? item : JSON.stringify(item);
  if (variantKey) {
    const value = item[variantKey];
    const text = typeof value === 'string' ? fallbackText(value) : isObject(value) ? summaryOf(value) : '';
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

/** Le espressioni `t('chiave', 'Ripiego')` si riassumono con il ripiego; i testi lunghi si accorciano. */
export function fallbackText(text: string): string {
  const quoted = /t\(\s*(['"])(?:\\.|(?!\1).)*\1\s*,\s*(['"])((?:\\.|(?!\2).)*)\2/.exec(text);
  const fallback = quoted ? quoted[3].replace(/\\(.)/g, '$1') : null;
  const plain = (fallback ?? text).replace(/\s+/g, ' ').trim();
  return plain.length > 40 ? plain.slice(0, 39) + '…' : plain;
}

/** Schermata vuota da cui parte un documento nuovo. */
export function emptyScreen(t: Translate): JsonObject {
  return { schemaVersion: '1.0', screen: 'nuova-schermata', title: t('ed.tpl.screenTitle'), dataSources: {}, components: [] };
}
