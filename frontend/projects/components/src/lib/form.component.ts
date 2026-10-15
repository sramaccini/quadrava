import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { fieldError, repeaterError, repeaterRows } from './field-validation';
import { nextId } from './shared';

/** Form: initial values come from the `source` data source (if it returns an object); actions receive `form` in the scope. */
@Component({
  selector: 'lc-form',
  imports: [FieldControlComponent, NzFormModule, NzButtonModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; container-type: inline-size; }
    form { max-width: 560px; }
    /* Repeatable rows need horizontal space. */
    form.wide { max-width: 880px; }
    form.grid { max-width: none; display: grid; grid-template-columns: repeat(var(--lc-form-columns), minmax(0, 1fr)); column-gap: 16px; }
    form.grid > nz-form-item { grid-column: span var(--lc-field-span, 1); }
    form.grid > .actions { grid-column: 1 / -1; }
    /* With little space (less than 600px) the grid goes back to one column. */
    @container (max-width: 600px) {
      form.grid { grid-template-columns: minmax(0, 1fr); }
      form.grid > nz-form-item { grid-column: auto; }
    }
    .actions { display: flex; gap: var(--lc-gap, 12px); }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="vertical" novalidate [class.grid]="columns() > 1" [class.wide]="hasRows()" [style.--lc-form-columns]="columns()" (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, fieldScope())) {
          <nz-form-item [style.--lc-field-span]="span(field)">
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [id]="id + field.name + '-label'" [nzRequired]="!!field.required" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, fieldScope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, fieldScope()) || field.name }}</nz-form-label>
            }
            <nz-form-control [nzValidateStatus]="error(field) && field.type !== 'repeater' ? 'error' : ''" [nzErrorTip]="error(field) ?? undefined">
              <lc-field-control
                [field]="field"
                [runtime]="runtime()"
                [scope]="fieldScope()"
                [value]="values()[field.name]"
                [disabled]="readOnly(field)"
                [inputId]="id + field.name"
                [labelId]="id + field.name + '-label'"
                [invalid]="!!error(field)"
                [submitted]="submitted()"
                [summary]="error(field)"
                (valueChange)="set(field, $event)"
              />
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
  /** If present, a button that cancels appears next to the actions (used by form windows). */
  readonly cancelLabel = input<string | null>(null);
  /** After an action: true if the steps succeeded. Not emitted if validation blocks the submit. */
  readonly completed = output<boolean>();
  readonly cancelled = output<void>();

  protected readonly i18n = inject(I18n);

  protected readonly id = nextId('lc-form') + '-';
  protected readonly values = signal<Record<string, unknown>>({});
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  /** The form contains repeatable rows. */
  protected readonly hasRows = computed(() => this.node().fields.some((f) => f.type === 'repeater'));

  /** Columns of the grid (from 1 to 4). */
  protected readonly columns = computed(() => Math.min(4, Math.max(1, this.node().columns ?? 1)));

  /** Columns taken by a field, never more than those of the grid. */
  protected span(field: FieldDefinition): number {
    return Math.min(this.columns(), Math.max(1, field.span ?? 1));
  }

  protected readonly fieldScope = computed<Scope>(() => ({ ...this.scope(), form: this.values() }));

  constructor() {
    // Initial values declared in the form (once), then those of the data source when it arrives.
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

  /** Every declared field exists in the values (null): `form.field` expressions do not fail before the data arrives. */
  private empty(): Record<string, unknown> {
    return Object.fromEntries(this.node().fields.map((f) => [f.name, null]));
  }

  /** Repeatable-rows fields start with at least `minRows` empty rows. */
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

  protected readOnly(field: FieldDefinition): boolean {
    return this.runtime().isReadOnly(field, this.fieldScope());
  }

  protected set(field: FieldDefinition, raw: unknown): void {
    const value = field.type === 'number' && raw !== '' && raw !== null ? Number(raw) : raw;
    this.values.update((current) => ({ ...current, [field.name]: value }));
  }

  /** Error message of the field, shown only after the first submit attempt. */
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
