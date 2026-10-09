import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { nextId, parseIsoDate, toIsoDate } from './shared';

/** Form: i valori iniziali arrivano dal data source `source` (se restituisce un oggetto); le azioni ricevono `form` nello scope. */
@Component({
  selector: 'lc-form',
  imports: [FormsModule, NzFormModule, NzInputModule, NzSelectModule, NzCheckboxModule, NzDatePickerModule, NzButtonModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    form { max-width: 560px; }
    nz-select, nz-date-picker { width: 100%; }
    .actions { display: flex; gap: var(--lc-gap, 12px); }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="vertical" novalidate (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, fieldScope())) {
          <nz-form-item>
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [nzRequired]="!!field.required" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, fieldScope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, fieldScope()) || field.name }}</nz-form-label>
            }
            <nz-form-control [nzValidateStatus]="error(field) ? 'error' : ''" [nzErrorTip]="error(field) ?? undefined">
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
      </div>
    </form>
  `,
})
export class FormComponent {
  readonly node = input.required<FormNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);

  /** Etichetta di un'opzione: tradotta con `optionKey` (`<prefisso>.<valore>`), altrimenti il valore stesso. */
  protected optionLabel(field: FieldDefinition, option: string): string {
    return field.optionKey ? this.i18n.t(`${field.optionKey}.${option}`, {}, option) : option;
  }
  protected readonly id = nextId('lc-form') + '-';
  protected readonly values = signal<Record<string, unknown>>({});
  protected readonly busy = signal(false);
  private readonly submitted = signal(false);

  /** Le date dei campi `date`, calcolate una volta per valore: un oggetto nuovo a ogni rilevamento delle modifiche farebbe riscrivere il campo di continuo. */
  protected readonly dates = computed<Record<string, Date | null>>(() =>
    Object.fromEntries(this.node().fields.filter((f) => f.type === 'date').map((f) => [f.name, parseIsoDate(this.values()[f.name])])),
  );

  protected readonly fieldScope = computed<Scope>(() => ({ ...this.scope(), form: this.values() }));

  constructor() {
    // Valori iniziali dichiarati nel form (una sola volta), poi quelli del data source quando arriva.
    effect(() => {
      const initial = this.node().initial;
      untracked(() => this.values.set({ ...this.empty(), ...((initial ? this.runtime().resolveValue(initial, this.scope()) : {}) as Record<string, unknown>) }));
    });
    effect(() => {
      const source = this.node().source;
      const data = source ? this.runtime().source(source).data : null;
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        untracked(() => this.values.set({ ...this.empty(), ...(data as Record<string, unknown>) }));
      }
    });
  }

  /** Ogni campo dichiarato esiste nei valori (nullo): le espressioni `form.campo` non vanno in errore prima che arrivino i dati. */
  private empty(): Record<string, unknown> {
    return Object.fromEntries(this.node().fields.map((f) => [f.name, null]));
  }

  protected text(field: FieldDefinition): string {
    const value = this.values()[field.name];
    return value === null || value === undefined ? '' : String(value);
  }

  protected selected(field: FieldDefinition): string | null {
    const value = this.values()[field.name];
    return value === null || value === undefined || value === '' ? null : String(value);
  }


  protected toIso(date: Date | null): string | null {
    return toIsoDate(date);
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
    const empty = value === undefined || value === null || value === '';
    if (field.required && empty && field.type !== 'checkbox') return this.i18n.t('lc.required');
    if (field.validate && !empty) {
      const result = this.runtime().engine.interpolate(field.validate.rule, {
        ...this.runtime().context(this.fieldScope()),
        value,
      });
      // regola in errore => non valido (fail-closed)
      if (!result.ok || result.value !== true) return this.runtime().text(field.validate.message, this.fieldScope()) || this.i18n.t('lc.invalid');
    }
    return null;
  }

  protected async run(action: ActionDefinition): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    const visible = this.node().fields.filter((f) => this.runtime().isVisible(f, this.fieldScope()));
    if (visible.some((f) => this.validate(f) !== null)) return;
    this.busy.set(true);
    try {
      await runSteps(this.runtime(), action.onClick, this.fieldScope());
    } finally {
      this.busy.set(false);
    }
  }
}
