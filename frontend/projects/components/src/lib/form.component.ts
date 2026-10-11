import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { FileFieldComponent } from './file-field.component';
import { fieldError, repeaterError, repeaterRows } from './field-validation';
import { RepeaterComponent } from './repeater.component';
import { LookupComponent } from './lookup.component';
import { nextId, parseIsoDate, parseIsoDateTime, toIsoDate, toIsoDateTime } from './shared';

/** Form: i valori iniziali arrivano dal data source `source` (se restituisce un oggetto); le azioni ricevono `form` nello scope. */
@Component({
  selector: 'lc-form',
  imports: [FormsModule, LookupComponent, FileFieldComponent, RepeaterComponent, NzFormModule, NzInputModule, NzSelectModule, NzCheckboxModule, NzDatePickerModule, NzButtonModule, NzTooltipModule, NzRadioModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; container-type: inline-size; }
    form { max-width: 560px; }
    form.grid { max-width: none; display: grid; grid-template-columns: repeat(var(--lc-form-columns), minmax(0, 1fr)); column-gap: 16px; }
    form.grid > nz-form-item { grid-column: span var(--lc-field-span, 1); }
    form.grid > .actions { grid-column: 1 / -1; }
    /* Con poco spazio (meno di 600px) la griglia torna a una colonna. */
    @container (max-width: 600px) {
      form.grid { grid-template-columns: minmax(0, 1fr); }
      form.grid > nz-form-item { grid-column: auto; }
    }
    nz-select, nz-date-picker { width: 100%; }
    .actions { display: flex; gap: var(--lc-gap, 12px); }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="vertical" novalidate [class.grid]="columns() > 1" [style.--lc-form-columns]="columns()" (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, fieldScope())) {
          <nz-form-item [style.--lc-field-span]="span(field)">
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [id]="id + field.name + '-label'" [nzRequired]="!!field.required" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, fieldScope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, fieldScope()) || field.name }}</nz-form-label>
            }
            <nz-form-control [nzValidateStatus]="error(field) && field.type !== 'repeater' ? 'error' : ''" [nzErrorTip]="error(field) ?? undefined">
              @switch (field.type) {
                @case ('select') {
                  <nz-select [nzId]="id + field.name" nzAllowClear nzPlaceHolder="—" [nzDisabled]="readOnly(field)" [ngModel]="selected(field)" (ngModelChange)="set(field, $event)">
                    @for (option of field.options ?? []; track option) {
                      <nz-option [nzValue]="option" [nzLabel]="optionLabel(field, option)" />
                    }
                  </nz-select>
                }
                @case ('checkbox') {
                  <label nz-checkbox [nzDisabled]="readOnly(field)" [ngModel]="values()[field.name] === true" (ngModelChange)="set(field, $event)">
                    {{ runtime().text(field.label, fieldScope()) || field.name }}
                  </label>
                }
                @case ('date') {
                  <nz-date-picker [nzId]="id + field.name" [nzDisabled]="readOnly(field)" [ngModel]="dates()[field.name]" (ngModelChange)="set(field, toIso($event))" />
                }
                @case ('datetime') {
                  <nz-date-picker [nzId]="id + field.name" [nzDisabled]="readOnly(field)" [nzShowTime]="{ nzFormat: 'HH:mm' }" nzFormat="dd/MM/yyyy HH:mm" [ngModel]="dates()[field.name]" (ngModelChange)="set(field, toIsoTime($event))" />
                }
                @case ('textarea') {
                  <textarea
                    nz-input
                    [id]="id + field.name"
                    [rows]="field.rows ?? 4"
                    [value]="text(field)"
                    [readOnly]="readOnly(field)"
                    [attr.aria-invalid]="!!error(field)"
                    (input)="set(field, $any($event.target).value)"
                  ></textarea>
                }
                @case ('radio') {
                  <nz-radio-group [attr.id]="id + field.name" role="radiogroup" [attr.aria-label]="runtime().text(field.label, fieldScope()) || field.name" [nzDisabled]="readOnly(field)" [ngModel]="selected(field)" (ngModelChange)="set(field, $event)">
                    @for (option of field.options ?? []; track option) {
                      <label nz-radio [nzValue]="option">{{ optionLabel(field, option) }}</label>
                    }
                  </nz-radio-group>
                }
                @case ('switch') {
                  <nz-switch [nzId]="id + field.name" [nzDisabled]="readOnly(field)" [ngModel]="values()[field.name] === true" (ngModelChange)="set(field, $event)" />
                }
                @case ('repeater') {
                  <lc-repeater [field]="field" [runtime]="runtime()" [scope]="fieldScope()" [value]="values()[field.name]" [disabled]="readOnly(field)" [submitted]="submitted()" [summary]="error(field)" [labelId]="id + field.name + '-label'" (valueChange)="set(field, $event)" />
                }
                @case ('file') {
                  <lc-file-field [inputId]="id + field.name" [field]="field" [runtime]="runtime()" [scope]="fieldScope()" [value]="values()[field.name]" [disabled]="readOnly(field)" (valueChange)="set(field, $event)" />
                }
                @case ('lookup') {
                  <lc-lookup [inputId]="id + field.name" [field]="field" [runtime]="runtime()" [scope]="fieldScope()" [value]="values()[field.name]" [disabled]="readOnly(field)" [placeholder]="'—'" (valueChange)="set(field, $event)" />
                }
                @case ('multiselect') {
                  <nz-select [nzId]="id + field.name" nzMode="multiple" nzAllowClear nzPlaceHolder="—" [nzDisabled]="readOnly(field)" [ngModel]="lists()[field.name]" (ngModelChange)="set(field, $event)">
                    @for (option of field.options ?? []; track option) {
                      <nz-option [nzValue]="option" [nzLabel]="optionLabel(field, option)" />
                    }
                  </nz-select>
                }
                @default {
                  <input
                    nz-input
                    [id]="id + field.name"
                    [type]="field.type"
                    [value]="text(field)"
                    [readOnly]="readOnly(field)"
                    [attr.autocomplete]="field.sensitive ? 'off' : null"
                    [attr.aria-invalid]="!!error(field)"
                    (input)="set(field, $any($event.target).value)"
                  />
                }
              }
            </nz-form-control>
          </nz-form-item>
        }
      }
      <div class="actions">
        @for (action of node().actions ?? []; track $index) {
          @if (runtime().isVisible(action, fieldScope())) {
            <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, fieldScope()) : null">
              <button nz-button nzType="primary" type="button" [nzLoading]="busy()" [disabled]="busy() || !runtime().isEnabled(action, fieldScope())" (click)="run(action)">
                {{ runtime().text(action.label, fieldScope()) }}
              </button>
            </span>
          }
        }
        @if (cancelLabel(); as cancel) {
          <button nz-button type="button" [disabled]="busy()" (click)="cancelled.emit()">{{ cancel }}</button>
        }
      </div>
    </form>
  `,
})
export class FormComponent {
  readonly node = input.required<FormNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  /** Se presente, accanto alle azioni compare un pulsante che annulla (usato dalle finestre con form). */
  readonly cancelLabel = input<string | null>(null);
  /** Dopo un'azione: true se i passi sono riusciti. Non si emette se la validazione blocca l'invio. */
  readonly completed = output<boolean>();
  readonly cancelled = output<void>();

  protected readonly i18n = inject(I18n);

  /** Etichetta di un'opzione: tradotta con `optionKey` (`<prefisso>.<valore>`), altrimenti il valore stesso. */
  protected optionLabel(field: FieldDefinition, option: string): string {
    return field.optionKey ? this.i18n.t(`${field.optionKey}.${option}`, {}, option) : option;
  }
  protected readonly id = nextId('lc-form') + '-';
  protected readonly values = signal<Record<string, unknown>>({});
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  /** Le date dei campi `date`, calcolate una volta per valore: un oggetto nuovo a ogni rilevamento delle modifiche farebbe riscrivere il campo di continuo. */
  protected readonly dates = computed<Record<string, Date | null>>(() =>
    Object.fromEntries(
      this.node()
        .fields.filter((f) => f.type === 'date' || f.type === 'datetime')
        .map((f) => [f.name, f.type === 'date' ? parseIsoDate(this.values()[f.name]) : parseIsoDateTime(this.values()[f.name])]),
    ),
  );

  /** Colonne della griglia (da 1 a 4). */
  protected readonly columns = computed(() => Math.min(4, Math.max(1, this.node().columns ?? 1)));

  /** Colonne occupate da un campo, mai più di quelle della griglia. */
  protected span(field: FieldDefinition): number {
    return Math.min(this.columns(), Math.max(1, field.span ?? 1));
  }

  protected readonly fieldScope = computed<Scope>(() => ({ ...this.scope(), form: this.values() }));

  constructor() {
    // Valori iniziali dichiarati nel form (una sola volta), poi quelli del data source quando arriva.
    effect(() => {
      const initial = this.node().initial;
      untracked(() => this.values.set(this.normalize({ ...this.empty(), ...((initial ? this.runtime().resolveValue(initial, this.scope()) : {}) as Record<string, unknown>) })));
    });
    effect(() => {
      const source = this.node().source;
      const data = source ? this.runtime().source(source).data : null;
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        untracked(() => this.values.set(this.normalize({ ...this.empty(), ...(data as Record<string, unknown>) })));
      }
    });
  }

  /** Ogni campo dichiarato esiste nei valori (nullo): le espressioni `form.campo` non vanno in errore prima che arrivino i dati. */
  private empty(): Record<string, unknown> {
    return Object.fromEntries(this.node().fields.map((f) => [f.name, null]));
  }

  /** I campi a righe ripetibili partono con almeno `minRows` righe, vuote. */
  private normalize(values: Record<string, unknown>): Record<string, unknown> {
    const out = { ...values };
    for (const field of this.node().fields) {
      if (field.type !== 'repeater') continue;
      const rows = repeaterRows(out[field.name]);
      while (rows.length < (field.minRows ?? 0)) {
        rows.push(Object.fromEntries((field.fields ?? []).map((f) => [f.name, f.type === 'checkbox' || f.type === 'switch' ? false : null])));
      }
      out[field.name] = rows;
    }
    return out;
  }

  protected text(field: FieldDefinition): string {
    const value = this.values()[field.name];
    return value === null || value === undefined ? '' : String(value);
  }

  protected selected(field: FieldDefinition): string | null {
    const value = this.values()[field.name];
    return value === null || value === undefined || value === '' ? null : String(value);
  }


  /** Valori delle selezioni multiple, calcolati una volta per valore: un elenco nuovo a ogni disegno farebbe ridisegnare la select senza fine. */
  protected readonly lists = computed<Record<string, string[]>>(() =>
    Object.fromEntries(
      this.node()
        .fields.filter((f) => f.type === 'multiselect')
        .map((f) => {
          const value = this.values()[f.name];
          return [f.name, Array.isArray(value) ? value.map(String) : []];
        }),
    ),
  );

  protected toIso(date: Date | null): string | null {
    return toIsoDate(date);
  }

  protected toIsoTime(date: Date | null): string | null {
    return toIsoDateTime(date);
  }


  protected readOnly(field: FieldDefinition): boolean {
    return this.runtime().isReadOnly(field, this.fieldScope());
  }

  protected set(field: FieldDefinition, raw: unknown): void {
    const value = field.type === 'number' && raw !== '' && raw !== null ? Number(raw) : raw;
    this.values.update((current) => ({ ...current, [field.name]: value }));
  }

  /** Messaggio di errore del campo, mostrato solo dopo il primo tentativo di invio. */
  protected error(field: FieldDefinition): string | null {
    return this.submitted() ? this.validate(field) : null;
  }

  private validate(field: FieldDefinition): string | null {
    const value = this.values()[field.name];
    return field.type === 'repeater'
      ? repeaterError(field, value, this.runtime(), this.fieldScope(), this.i18n)
      : fieldError(field, value, this.runtime(), this.fieldScope(), this.i18n);
  }

  protected async run(action: ActionDefinition): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    const visible = this.node().fields.filter((f) => this.runtime().isVisible(f, this.fieldScope()));
    if (visible.some((f) => this.validate(f) !== null)) return;
    this.busy.set(true);
    try {
      this.completed.emit(await runSteps(this.runtime(), action.onClick, this.fieldScope()));
    } finally {
      this.busy.set(false);
    }
  }
}
