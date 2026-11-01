import type { FieldDefinition, FieldsFromDefinition } from 'schema';

/** Most fields a data source can add to a form. */
export const MAX_DATA_FIELDS = 50;

/** Types a row can ask for without a model in `types`: the simple controls, whose rules the row cannot change. */
const PLAIN_TYPES: ReadonlySet<string> = new Set(['text', 'textarea', 'number', 'date', 'datetime', 'checkbox', 'switch', 'select', 'multiselect', 'radio']);
const CHOICE_TYPES: ReadonlySet<string> = new Set(['select', 'multiselect', 'radio']);
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * A field of the form: one of `fields` (its label and options resolved by the screen), or one that comes from the data
 * of `fieldsFrom`, whose label and option labels are data, shown as they are and never evaluated. `key` tells the
 * fields apart (`custom.customer` when the values are kept in an object).
 */
export interface FormItem {
  readonly key: string;
  readonly field: FieldDefinition;
  /** Label of a data field (text); null for a field of the screen. */
  readonly label: string | null;
  /** Labels of the options that came with the row, by value; null when the options are those of the screen. */
  readonly optionLabels: Readonly<Record<string, string>> | null;
}

/** The fields of the screen, as items of the form. */
export function screenItems(fields: readonly FieldDefinition[]): FormItem[] {
  return fields.map((field) => ({ key: field.name, field, label: null, optionLabels: null }));
}

/**
 * The fields described by the rows of `fieldsFrom`, in order: a valid name not seen yet (nor among `taken`, the names of
 * the fields of the screen, when the values are not in an object), a type among the models or the plain ones, at most
 * {@link MAX_DATA_FIELDS}. Every other row is left out. The model of the type gives the control and its rules; the row
 * gives name, label, options and required.
 */
export function dataItems(list: unknown, from: FieldsFromDefinition, taken: ReadonlySet<string> = new Set()): FormItem[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const items: FormItem[] = [];
  for (const row of list) {
    if (items.length === MAX_DATA_FIELDS) break;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const name = r[from.nameField ?? 'name'];
    if (typeof name !== 'string' || !NAME.test(name) || seen.has(name) || (!from.into && taken.has(name))) continue;
    const type = r[from.typeField ?? 'type'];
    if (typeof type !== 'string') continue;
    const model = from.types && Object.hasOwn(from.types, type) ? from.types[type] : PLAIN_TYPES.has(type) ? ({ name, type } as FieldDefinition) : null;
    if (!model) continue;
    seen.add(name);
    const label = r[from.labelField ?? 'label'];
    const options = optionsOf(r[from.optionsField ?? 'options']);
    const required = r[from.requiredField ?? 'required'] === true || model.required === true;
    // Options of the row replace those of the model, and their labels are data: the translations of the model do not apply.
    const ownOptions = CHOICE_TYPES.has(model.type) && options !== null;
    const { optionKey, ...rules } = model;
    const field: FieldDefinition = {
      ...rules,
      name,
      ...(ownOptions ? { options: options.map((o) => o.value) } : optionKey ? { optionKey } : {}),
      ...(required ? { required: true } : {}),
    };
    items.push({
      key: from.into ? `${from.into}.${name}` : name,
      field,
      label: typeof label === 'string' && label.trim() !== '' ? label : name,
      optionLabels: ownOptions ? Object.fromEntries(options.map((o) => [o.value, o.label])) : null,
    });
  }
  return items;
}

/** Options of a row: values, or `{ value, label }`; values as text, repeated ones left out. */
function optionsOf(raw: unknown): { value: string; label: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const option of raw) {
    const o: Record<string, unknown> = option !== null && typeof option === 'object' ? (option as Record<string, unknown>) : { value: option };
    const value = typeof o['value'] === 'string' || typeof o['value'] === 'number' ? String(o['value']) : '';
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: typeof o['label'] === 'string' && o['label'] !== '' ? o['label'] : value });
  }
  return options;
}

/** The value of an item among the values of the form: inside the object of `fieldsFrom.into` for the data fields. */
export function itemValue(values: Readonly<Record<string, unknown>>, item: FormItem, into: string | undefined): unknown {
  if (item.label === null || !into) return values[item.field.name];
  const holder = values[into];
  return holder !== null && typeof holder === 'object' && !Array.isArray(holder) ? (holder as Record<string, unknown>)[item.field.name] : undefined;
}

/** The values of the form with the value of an item changed. */
export function withItemValue(values: Readonly<Record<string, unknown>>, item: FormItem, into: string | undefined, value: unknown): Record<string, unknown> {
  if (item.label === null || !into) return { ...values, [item.field.name]: value };
  const holder = values[into];
  const current = holder !== null && typeof holder === 'object' && !Array.isArray(holder) ? (holder as Record<string, unknown>) : {};
  return { ...values, [into]: { ...current, [item.field.name]: value } };
}
