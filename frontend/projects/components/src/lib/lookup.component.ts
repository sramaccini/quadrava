import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzSelectModule } from 'ng-zorro-antd/select';
import type { FieldDefinition } from 'schema';

interface Option {
  value: unknown;
  label: string;
}

/** Wait before searching: keystrokes close together become a single request. */
const DEBOUNCE_MS = 300;

/**
 * `lookup` field: it proposes the rows of a GET data source searched while the user types (variable `search`).
 * The value is the `valueField` of the chosen row, the text shown is `labelField`. A response older than
 * that of the latest search is discarded. If the current value is not among the known rows (for example in an
 * edit form) and the data source uses `{{ lookupKey }}`, the field asks the service for the row of that value to
 * show its text. The field's requests do not change the rows the data source shows to the other components.
 * Used by the form, the filter bar and the repeatable rows.
 */
@Component({
  selector: 'lc-lookup',
  imports: [FormsModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: block; } nz-select { width: 100%; min-width: 200px; }`,
  template: `
    <nz-select
      [nzId]="inputId()"
      nzShowSearch
      nzServerSearch
      nzAllowClear
      [nzPlaceHolder]="placeholder()"
      [nzDisabled]="disabled()"
      [nzLoading]="loading()"
      [nzNotFoundContent]="loading() ? i18n.t('lc.loading') : i18n.t('lc.noResults')"
      [ngModel]="value() ?? null"
      (ngModelChange)="choose($event)"
      (nzOnSearch)="search($event)"
      (nzOpenChange)="$event && search('')"
    >
      @for (option of options(); track $index) {
        <nz-option [nzValue]="option.value" [nzLabel]="option.label" />
      }
    </nz-select>
  `,
})
export class LookupComponent {
  readonly field = input.required<FieldDefinition>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly value = input<unknown>(null);
  readonly disabled = input(false);
  readonly inputId = input<string | null>(null);
  readonly placeholder = input('—');
  readonly valueChange = output<unknown>();

  protected readonly i18n = inject(I18n);
  protected readonly loading = signal(false);
  /** Rows of the latest search; `null` until the user searches (the data already loaded by the data source is used). */
  private readonly found = signal<Record<string, unknown>[] | null>(null);
  /** Texts already seen for every value: the chosen value stays readable even when it is not among the current results. */
  private readonly labels = signal<ReadonlyMap<unknown, string>>(new Map());
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sequence = 0;
  /** Values whose text has already been asked from the service (only once per value). */
  private readonly asked = new Set<unknown>();

  private readonly spec = computed(() => {
    const lookup = this.field().lookup;
    return { source: lookup?.source ?? '', valueField: lookup?.valueField ?? 'id', labelField: lookup?.labelField ?? 'id', minChars: lookup?.minChars ?? 1 };
  });

  protected readonly options = computed<Option[]>(() => {
    const { source, valueField, labelField } = this.spec();
    const rows = this.found() ?? rowsOf(this.runtime().source(source).data);
    const options = rows.map((row) => ({ value: row[valueField], label: textOf(row[labelField], row[valueField]) }));
    const current = this.value();
    if (current !== null && current !== undefined && current !== '' && !options.some((o) => o.value === current)) {
      options.unshift({ value: current, label: this.labels().get(current) ?? String(current) });
    }
    return options;
  });

  /** Can the data source search by key? Only then is it worth asking for the text of a value. */
  private readonly resolvable = computed(() => JSON.stringify(this.runtime().definition.dataSources?.[this.spec().source] ?? {}).includes('lookupKey'));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
    // Value without a known text: its row is asked from the service (after the data source has loaded its rows).
    effect(() => {
      const value = this.value();
      if (value === null || value === undefined || value === '' || !this.resolvable()) return;
      const status = this.runtime().source(this.spec().source).status;
      if (status === 'loading') return;
      const known = this.labels().has(value) || this.options().some((o) => o.value === value && o.label !== String(value));
      if (known) return;
      untracked(() => void this.resolve(value));
    });
  }

  private async resolve(value: unknown): Promise<void> {
    if (this.asked.has(value)) return;
    this.asked.add(value);
    const { source, valueField, labelField } = this.spec();
    const result = await this.runtime().query(source, { search: null, lookupKey: value }, this.scope());
    const row = result.ok ? rowsOf(result.data).find((r) => r[valueField] === value) : undefined;
    if (row) this.labels.update((map) => new Map(map).set(value, textOf(row[labelField], value)));
  }

  protected search(text: string): void {
    if (this.timer) clearTimeout(this.timer);
    const { minChars } = this.spec();
    if (text.length < minChars) {
      // Text too short: back to the rows already loaded by the data source, without new requests.
      this.sequence++;
      this.found.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.timer = setTimeout(() => void this.run(text), DEBOUNCE_MS);
  }

  private async run(text: string): Promise<void> {
    const seq = ++this.sequence;
    const { source, valueField, labelField } = this.spec();
    const result = await this.runtime().query(source, { search: text }, this.scope());
    if (seq !== this.sequence) return;
    this.loading.set(false);
    const rows = result.ok ? rowsOf(result.data) : [];
    this.found.set(rows);
    this.labels.update((map) => {
      const next = new Map(map);
      for (const row of rows) next.set(row[valueField], textOf(row[labelField], row[valueField]));
      return next;
    });
  }

  protected choose(value: unknown): void {
    const option = this.options().find((o) => o.value === value);
    if (option) this.labels.update((map) => new Map(map).set(option.value, option.label));
    this.valueChange.emit(value ?? null);
  }
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const items = (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

function textOf(label: unknown, fallback: unknown): string {
  return label === null || label === undefined ? String(fallback ?? '') : String(label);
}
