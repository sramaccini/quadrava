import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { getIn, isObject, moveBy, setIn, toPointer, type Json, type JsonObject, type Path } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { listItem, objectFields, type ItemShape, type PropertyInfo, type Variant } from '../model/schema-info';
import { defaultItem, summaryOf } from '../model/templates';
import { JsonFieldComponent } from './json-field.component';

/** Proprietà mostrate come area di testo su più righe anche se sono semplici testi. */
const LONG_TEXT = new Set(['text', 'description', 'tooltip', 'title', 'confirm', 'toast', 'message']);

export interface FieldRow {
  info: PropertyInfo;
  value: Json | undefined;
  path: Path;
  id: string;
  issues: string[];
}

/** Un elemento di un elenco, con il riassunto mostrato quando è chiuso. */
interface ListEntry {
  index: number;
  path: Path;
  summary: string;
  variant: Variant | null;
  fields: PropertyInfo[];
  hasIssues: boolean;
}

/**
 * Campi di un oggetto del documento, generati dallo schema: testo, espressione, scelta, sì/no, numero, gruppi di campi
 * (oggetti) ed elenchi di elementi (colonne, campi, azioni, passi) modificabili uno per uno. Si usa ricorsivamente per
 * gli elementi degli elenchi e per gli oggetti annidati; ogni elenco si può anche modificare come JSON.
 */
@Component({
  selector: 'ed-fields',
  imports: [
    FormsModule,
    JsonFieldComponent,
    NzButtonModule,
    NzCheckboxModule,
    NzDropdownModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzMenuModule,
    NzSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './fields.component.scss',
  templateUrl: './fields.component.html',
})
export class FieldsComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly expressionHint = '{{ … }}';

  /** Percorso dell'oggetto di cui si mostrano i campi. */
  readonly path = input.required<Path>();
  readonly fields = input.required<PropertyInfo[]>();
  /** Prefisso degli id dei campi (unici anche negli elementi annidati); `prop` per quelli dell'inspector. */
  readonly idPrefix = input('prop');
  /** Non ripetere sotto ogni espressione la spiegazione comune (la mostra chi contiene i campi). */
  readonly hideExpressionHelp = input(false);

  /** Elementi aperti degli elenchi (per percorso). */
  protected readonly open = signal<Set<string>>(new Set());
  /** Elenchi mostrati come JSON invece che elemento per elemento. */
  protected readonly raw = signal<Set<string>>(new Set());

  protected readonly rows = computed<FieldRow[]>(() => {
    const doc = this.store.doc();
    const path = this.path();
    const value = getIn(doc, path);
    const object = isObject(value) ? value : {};
    const issues = this.store.issues();
    return this.fields().map((info) => {
      const propertyPath = [...path, info.name];
      const pointer = toPointer(propertyPath);
      return {
        info,
        value: object[info.name],
        path: propertyPath,
        id: `${this.idPrefix()}-${info.name}`,
        issues: issues.filter((i) => i.pointer === pointer || i.pointer.startsWith(pointer + '/')).map((i) => i.message),
      };
    });
  });

  protected isLong(row: FieldRow): boolean {
    return row.info.kind === 'expression' || LONG_TEXT.has(row.info.name) || (typeof row.value === 'string' && row.value.includes('{{'));
  }

  protected setText(row: FieldRow, text: string): void {
    // Un testo vuoto toglie la proprietà facoltativa; quella obbligatoria resta (vuota), così lo schema la segnala.
    this.store.setValue(row.path, text === '' && !row.info.required ? undefined : text);
  }

  protected setNumber(row: FieldRow, value: number | null): void {
    this.store.setValue(row.path, value === null || Number.isNaN(value) ? undefined : value);
  }

  protected setBoolean(row: FieldRow, checked: boolean): void {
    // Il valore predefinito delle proprietà sì/no è «no»: deselezionare toglie la proprietà facoltativa.
    this.store.setValue(row.path, checked ? true : row.info.required ? false : undefined);
  }

  protected setOption(row: FieldRow, option: string | null): void {
    this.store.setValue(row.path, option ?? undefined);
  }

  protected setJson(row: FieldRow, value: Json | undefined): void {
    this.store.setValue(row.path, value);
  }

  protected asText(value: Json | undefined): string {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value);
  }

  protected asNumber(value: Json | undefined): number | null {
    return typeof value === 'number' ? value : null;
  }

  // Oggetti annidati

  protected objectFields(row: FieldRow): PropertyInfo[] {
    return objectFields(row.info);
  }

  protected addObject(row: FieldRow): void {
    this.store.setValue(row.path, defaultItem(objectFields(row.info), 0, (k) => this.i18n.t(k)));
  }

  // Elenchi

  protected shape(row: FieldRow): ItemShape | null {
    return listItem(row.info);
  }

  protected variants(row: FieldRow): Variant[] {
    const shape = listItem(row.info);
    return shape && 'variants' in shape ? shape.variants : [];
  }

  protected entries(row: FieldRow): ListEntry[] {
    const shape = listItem(row.info);
    const items = Array.isArray(row.value) ? row.value : [];
    const issues = this.store.issues();
    return items.map((item, index) => {
      const path = [...row.path, index];
      const pointer = toPointer(path);
      const variant = shape && 'variants' in shape ? (shape.variants.find((v) => isObject(item) && v.key in item) ?? null) : null;
      const fields = shape ? ('variants' in shape ? (variant?.fields ?? []) : shape.fields) : [];
      return {
        index,
        path,
        summary: summaryOf(item, variant?.key),
        variant,
        fields,
        hasIssues: issues.some((i) => i.pointer === pointer || i.pointer.startsWith(pointer + '/')),
      };
    });
  }

  protected key(path: Path): string {
    return path.join('/');
  }

  protected isOpen(path: Path): boolean {
    return this.open().has(this.key(path));
  }

  protected toggle(path: Path): void {
    const key = this.key(path);
    this.open.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected isRaw(row: FieldRow): boolean {
    return this.raw().has(this.key(row.path));
  }

  protected toggleRaw(row: FieldRow): void {
    const key = this.key(row.path);
    this.raw.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Aggiunge un elemento in fondo (della variante scelta, per i passi) e lo apre. */
  protected addItem(row: FieldRow, variant?: Variant): void {
    const shape = listItem(row.info);
    if (!shape) return;
    const count = Array.isArray(row.value) ? row.value.length : 0;
    const t = (k: string): string => this.i18n.t(k);
    const item: JsonObject = 'variants' in shape ? defaultItem((variant ?? shape.variants[0]).fields, count, t) : defaultItem(shape.fields, count, t);
    const list = Array.isArray(row.value) ? row.value : [];
    this.store.apply(setIn(this.store.doc(), row.path, [...list, item]));
    this.open.update((set) => new Set(set).add(this.key([...row.path, count])));
  }

  protected moveItem(entry: ListEntry, delta: number): void {
    const result = moveBy(this.store.doc(), entry.path, delta);
    this.store.apply(result.doc);
    // L'elemento aperto resta aperto nella nuova posizione.
    if (this.isOpen(entry.path)) {
      this.toggle(entry.path);
      this.open.update((set) => new Set(set).add(this.key(result.path)));
    }
  }

  protected removeItem(row: FieldRow, entry: ListEntry): void {
    const list = (Array.isArray(row.value) ? row.value : []).filter((_, i) => i !== entry.index);
    // Un elenco facoltativo che resta vuoto sparisce dal documento.
    this.store.apply(setIn(this.store.doc(), row.path, list.length || row.info.required ? list : undefined));
    this.open.set(new Set());
  }
}
