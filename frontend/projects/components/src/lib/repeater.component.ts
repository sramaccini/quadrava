import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, inputHints, transformValue, type RemoteChecks, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { FieldDefinition } from 'schema';
import { repeaterCellChecks, repeaterRows, validationEnv } from './field-validation';
import { FileFieldComponent } from './file-field.component';
import { IconComponent } from './icon.component';
import { LookupComponent } from './lookup.component';
import { nextId, parseIsoDate, toIsoDate } from './shared';

type Row = Record<string, unknown>;

/**
 * `repeater` field: a list of rows, each with the fields of `fields` (also lookup and file, not nested rows). The value is a list of objects.
 * Rows are added and removed with the buttons, within `minRows` and `maxRows`; the errors of the cells appear
 * after the first submit attempt of the form (`submitted`).
 */
@Component({
  selector: 'lc-repeater',
  imports: [FormsModule, FileFieldComponent, IconComponent, LookupComponent, NzButtonModule, NzCheckboxModule, NzDatePickerModule, NzInputModule, NzSelectModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 500; padding: 0 8px 6px 0; color: var(--lc-color-muted, #5d6b7a); white-space: nowrap; }
    th .required { color: var(--lc-color-danger, #c62828); margin-right: 2px; }
    td { padding: 0 8px 8px 0; vertical-align: top; min-width: 110px; }
    td.wide { min-width: 200px; }
    td.remove { min-width: 0; width: 40px; padding-right: 0; }
    nz-select, nz-date-picker { width: 100%; }
    .cell-error { margin: 2px 0 0; font-size: 12px; color: var(--lc-color-danger, #c62828); }
    .cell-checking { margin: 2px 0 0; font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .cell-error.warning { color: var(--lc-color-warning, #ad6800); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .summary { margin: 6px 0 0; color: var(--lc-color-danger, #c62828); }
    .empty { margin: 0 0 8px; color: var(--lc-color-muted, #5d6b7a); }
    button lc-icon { margin-right: 6px; }
    td.remove button lc-icon { margin-right: 0; }
  `,
  template: `
    <div class="wrap" role="group" [attr.aria-labelledby]="labelId()">
      @if (rows().length) {
        <table>
          <thead>
            <tr>
              @for (sub of field().fields ?? []; track sub.name) {
                <th scope="col">
                  @if (sub.required) {
                    <span class="required" aria-hidden="true">*</span>
                  }
                  {{ label(sub) }}
                </th>
              }
              <th scope="col"><span class="visually-hidden">{{ i18n.t('lc.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index; let i = $index) {
              <tr>
                @for (sub of field().fields ?? []; track sub.name) {
                  <td [class.wide]="sub.type === 'lookup' || sub.type === 'file'">
                    @let cellId = id + i + '-' + sub.name;
                    @let check = checks()[i]?.[sub.name];
                    <!-- After the first submit; a remote check (running or done) as soon as it is known. -->
                    @let cell = submitted() || check?.pending || check?.remote ? check : null;
                    @let err = serverErrors()[i + '/' + sub.name] ?? cell?.error;
                    @switch (sub.type) {
                      @case ('select') {
                        <nz-select [nzId]="cellId" nzAllowClear nzPlaceHolder="—" [nzDisabled]="disabled()" [nzStatus]="err ? 'error' : ''" [ngModel]="row[sub.name] ?? null" (ngModelChange)="set(i, sub, $event)">
                          @for (option of sub.options ?? []; track option) {
                            <nz-option [nzValue]="option" [nzLabel]="optionLabel(sub, option)" />
                          }
                        </nz-select>
                      }
                      @case ('checkbox') {
                        <label nz-checkbox [attr.aria-label]="label(sub)" [nzDisabled]="disabled()" [ngModel]="row[sub.name] === true" (ngModelChange)="set(i, sub, $event)"></label>
                      }
                      @case ('switch') {
                        <label class="visually-hidden" [for]="cellId">{{ label(sub) }}</label>
                        <nz-switch [nzId]="cellId" [nzDisabled]="disabled()" [ngModel]="row[sub.name] === true" (ngModelChange)="set(i, sub, $event)" />
                      }
                      @case ('date') {
                        <label class="visually-hidden" [for]="cellId">{{ label(sub) }}</label>
                        <nz-date-picker [nzId]="cellId" nzFormat="dd/MM/yyyy" [nzDisabled]="disabled()" [nzStatus]="err ? 'error' : ''" [ngModel]="dates()[i]?.[sub.name] ?? null" (ngModelChange)="set(i, sub, toIso($event))" />
                      }
                      @case ('lookup') {
                        <label class="visually-hidden" [for]="cellId">{{ label(sub) }}</label>
                        <lc-lookup [inputId]="cellId" [field]="sub" [runtime]="runtime()" [scope]="cellScope(row)" [value]="row[sub.name]" [disabled]="disabled()" (valueChange)="set(i, sub, $event)" />
                      }
                      @case ('file') {
                        <lc-file-field [inputId]="cellId" [field]="sub" [runtime]="runtime()" [scope]="cellScope(row)" [value]="row[sub.name]" [disabled]="disabled()" (valueChange)="set(i, sub, $event)" />
                      }
                      @case ('textarea') {
                        <textarea nz-input [id]="cellId" [rows]="sub.rows ?? 2" [attr.aria-label]="label(sub)" [readonly]="disabled()" [nzStatus]="err ? 'error' : ''" [value]="text(row, sub)" (input)="set(i, sub, $any($event.target).value)" (change)="set(i, sub, transform(sub, $any($event.target).value))"></textarea>
                      }
                      @default {
                        <input nz-input [id]="cellId" [type]="sub.type === 'number' ? 'number' : 'text'" [attr.inputmode]="hints(sub).inputMode ?? null" [attr.aria-label]="label(sub)" [attr.aria-invalid]="!!err" [readonly]="disabled()" [nzStatus]="err ? 'error' : ''" [value]="text(row, sub)" (input)="set(i, sub, $any($event.target).value)" (change)="set(i, sub, transform(sub, $any($event.target).value))" />
                      }
                    }
                    @if (err) {
                      <p class="cell-error" role="alert">{{ err }}</p>
                    } @else if (cell?.warning) {
                      <p class="cell-error warning">{{ cell?.warning }}</p>
                    } @else if (cell?.pending) {
                      <p class="cell-checking" role="status">{{ i18n.t('lc.validation.checking') }}</p>
                    }
                  </td>
                }
                <td class="remove">
                  <button nz-button nzType="text" type="button" [disabled]="disabled() || rows().length <= min()" [attr.aria-label]="i18n.t('lc.removeRow', { n: i + 1 })" (click)="remove(i)">
                    <lc-icon name="delete" />
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="empty">{{ i18n.t('lc.noRows') }}</p>
      }
      @if (!disabled()) {
        <button nz-button nzType="dashed" type="button" [disabled]="rows().length >= max()" (click)="add()">
          <lc-icon name="plus" />{{ field().addLabel ? runtime().text(field().addLabel, scope()) : i18n.t('lc.addRow') }}
        </button>
      }
      @if (summary(); as message) {
        <p class="summary" role="alert">{{ message }}</p>
      }
    </div>
  `,
})
export class RepeaterComponent {
  readonly field = input.required<FieldDefinition>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly value = input<unknown>(null);
  readonly disabled = input(false);
  readonly submitted = input(false);
  /** Overall message of the field (missing or invalid rows), shown under the rows. */
  readonly summary = input<string | null>(null);
  /** Errors of the cells returned by the service (`row/column` → message), shown until the rows change. */
  readonly serverErrors = input<Record<string, string>>({});
  /** Remote checks of the form, for the remote rules of the cells (without them those rules fail closed). */
  readonly remote = input<RemoteChecks | undefined>(undefined);
  /** Id of the label of the field, to give the group a name. */
  readonly labelId = input<string | null>(null);
  readonly valueChange = output<Row[]>();

  protected readonly i18n = inject(I18n);
  protected readonly id = nextId('lc-rep') + '-';
  /** Current rows: they follow the form value, but update right away at every change (two changes close together are not lost). */
  protected readonly rows = linkedSignal(() => repeaterRows(this.value()));
  protected readonly min = computed(() => this.field().minRows ?? 0);
  protected readonly max = computed(() => this.field().maxRows ?? 50);
  /** Errors and warnings of the cells (their rules, and the values repeated across rows). */
  protected readonly checks = computed(() => repeaterCellChecks(this.field(), this.rows(), validationEnv(this.runtime(), this.i18n, this.scope(), {}, [], this.remote())));
  /** Dates of the `date` cells, once per value (see the form). */
  protected readonly dates = computed(() =>
    this.rows().map((row) => Object.fromEntries((this.field().fields ?? []).filter((f) => f.type === 'date').map((f) => [f.name, parseIsoDate(row[f.name])]))),
  );

  /** Scope of a cell: data sources and expressions also see the row in `item` (once per row). */
  private readonly cellScopes = new WeakMap<Row, Scope>();
  protected cellScope(row: Row): Scope {
    let scope = this.cellScopes.get(row);
    if (!scope) this.cellScopes.set(row, (scope = { ...this.scope(), item: row }));
    return scope;
  }

  /** Keyboard of the text cells, from their format. */
  protected hints(sub: FieldDefinition): ReturnType<typeof inputHints> {
    return inputHints(sub, this.runtime().validatorRegistry);
  }

  protected label(sub: FieldDefinition): string {
    return this.runtime().text(sub.label, this.scope()) || sub.name;
  }

  protected optionLabel(sub: FieldDefinition, option: string): string {
    return sub.optionKey ? this.i18n.t(`${sub.optionKey}.${option}`, {}, option) : option;
  }

  protected text(row: Row, sub: FieldDefinition): string {
    const value = row[sub.name];
    return value === null || value === undefined ? '' : String(value);
  }

  /** The text of a cell after its `transform`, when leaving it. */
  protected transform(sub: FieldDefinition, text: string): unknown {
    return transformValue(sub, text);
  }

  protected toIso(date: Date | null): string | null {
    return toIsoDate(date);
  }

  private empty(): Row {
    return Object.fromEntries((this.field().fields ?? []).map((f) => [f.name, f.type === 'checkbox' || f.type === 'switch' ? false : null]));
  }

  protected set(index: number, sub: FieldDefinition, raw: unknown): void {
    const value = sub.type === 'number' && raw !== '' && raw !== null ? Number(raw) : raw === '' ? null : raw;
    this.emit(this.rows().map((row, i) => (i === index ? { ...row, [sub.name]: value } : row)));
  }

  protected add(): void {
    if (this.rows().length >= this.max()) return;
    this.emit([...this.rows(), this.empty()]);
  }

  protected remove(index: number): void {
    if (this.rows().length <= this.min()) return;
    this.emit(this.rows().filter((_, i) => i !== index));
  }

  private emit(rows: Row[]): void {
    this.rows.set(rows);
    this.valueChange.emit(rows);
  }
}
