import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { codeMessage, formRules, I18n, isRequired, NO_PROBLEM, pointerSegments, RemoteChecks, runSteps, transformValue, type FieldCheck, type FieldError, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { checkValue, personalValues, repeaterRows, validationEnv } from './field-validation';
import { nextId } from './shared';

/**
 * Form: initial values come from the `source` data source (if it returns an object); actions receive `form` in the scope.
 * The fields are checked with their rules and with the rules of the form across fields (`validation`) after the first
 * submit attempt: errors block the actions, warnings only inform. Remote rules run while the user types, their outcome
 * shows as soon as it is known, and the form waits for those in progress before sending. Field errors returned by the
 * service (Problem with `errors`) go to their fields, or to the cells of a repeater, until those change.
 */
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
              <nz-form-label [nzFor]="id + field.name" [id]="id + field.name + '-label'" [nzRequired]="required(field)" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, fieldScope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, fieldScope()) || field.name }}</nz-form-label>
            }
            @let problem = shown(field);
            <nz-form-control
              [nzValidateStatus]="field.type === 'repeater' ? '' : problem.error ? 'error' : problem.pending ? 'validating' : problem.warning ? 'warning' : ''"
              [nzHasFeedback]="!!problem.pending"
              [nzErrorTip]="problem.error ?? undefined"
              [nzWarningTip]="problem.warning ?? undefined"
            >
              <lc-field-control
                [field]="field"
                [runtime]="runtime()"
                [scope]="fieldScope()"
                [value]="values()[field.name]"
                [disabled]="readOnly(field)"
                [inputId]="id + field.name"
                [labelId]="id + field.name + '-label'"
                [invalid]="!!problem.error"
                [submitted]="submitted()"
                [summary]="problem.error ?? problem.warning"
                [cellErrors]="cellErrors()[field.name] ?? {}"
                [personal]="personal()"
                [remote]="remote()"
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

  /** Rules of the form across fields, by the field they check. */
  private readonly crossRules = computed(() => formRules(this.node().validation));
  /** Remote checks of the fields, one set per runtime. */
  protected readonly remote = computed(() => new RemoteChecks(this.runtime()));
  private readonly env = computed(() => validationEnv(this.runtime(), this.i18n, this.fieldScope(), this.values(), this.node().fields, this.remote()));
  /** Values of the text fields, which a password should not contain. */
  protected readonly personal = computed(() => personalValues(this.node().fields, this.values()));
  /** Messages of the field errors returned by the service, by field, and by cell (`row/column`) for repeaters. */
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly cellErrors = signal<Record<string, Record<string, string>>>({});

  constructor() {
    inject(DestroyRef).onDestroy(() => this.remote().destroy());
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
    // A field changed by the user is no longer the one the service rejected.
    if (field.name in this.serverErrors()) this.serverErrors.update(({ [field.name]: _, ...rest }) => rest);
    if (field.name in this.cellErrors()) this.cellErrors.update(({ [field.name]: _, ...rest }) => rest);
  }

  /** The asterisk of the label: required, or required now by a conditional rule. */
  protected required(field: FieldDefinition): boolean {
    return isRequired(field, this.env(), this.crossRules().get(field.name));
  }

  /**
   * Error or warning of the field: after the first submit attempt; a remote check (running or done) as soon as it is
   * known; an error of the service until the field changes.
   */
  protected shown(field: FieldDefinition): FieldCheck {
    const server = this.serverErrors()[field.name];
    if (server) return { error: server, warning: null };
    const check = this.check(field);
    return this.submitted() || check.pending || check.remote ? check : NO_PROBLEM;
  }

  private check(field: FieldDefinition): FieldCheck {
    return checkValue(field, this.values()[field.name], this.env(), this.crossRules().get(field.name));
  }

  private transform(name: string, value: unknown): unknown {
    const field = this.node().fields.find((f) => f.name === name);
    return field ? transformValue(field, value) : value;
  }

  /** Places the field errors of the service on the fields (and the cells of repeaters); returns how many it placed. */
  private placeServerErrors(errors: readonly FieldError[]): number {
    const fields: Record<string, string> = {};
    const cells: Record<string, Record<string, string>> = {};
    let placed = 0;
    for (const { path, code, params } of errors) {
      const [name, row, column, ...rest] = pointerSegments(path);
      const field = this.node().fields.find((f) => f.name === name);
      if (!field || rest.length) continue;
      const message = codeMessage(this.i18n, code, params);
      if (field.type === 'repeater' && row !== undefined && column !== undefined && /^\d+$/.test(row)) {
        cells[name] = { ...cells[name], [`${row}/${column}`]: message };
      } else if (row === undefined) {
        fields[name] = message;
      } else {
        continue;
      }
      placed++;
    }
    this.serverErrors.set(fields);
    this.cellErrors.set(cells);
    return placed;
  }

  protected async run(action: ActionDefinition): Promise<void> {
    if (this.busy()) return;
    this.submitted.set(true);
    this.serverErrors.set({});
    this.cellErrors.set({});
    // The steps receive the values as they are checked: after `transform` (usually already applied when leaving the field).
    this.values.update((values) => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, this.transform(name, value)])));
    this.busy.set(true);
    try {
      // The remote checks still waiting for their pause start now, and the form waits for their outcome (a value changed
      // just before the click is scheduled by the check itself: one more round).
      const visible = this.node().fields.filter((f) => this.runtime().isVisible(f, this.fieldScope()));
      let checks = visible.map((f) => this.check(f));
      for (let round = 0; round < 3 && checks.some((c) => c.pending); round++) {
        await this.remote().settle();
        checks = visible.map((f) => this.check(f));
      }
      if (checks.some((c) => c.error !== null || c.pending)) return;
      this.completed.emit(await runSteps(this.runtime(), action.onClick, this.fieldScope(), { onFieldErrors: (errors) => this.placeServerErrors(errors) }));
    } finally {
      this.busy.set(false);
    }
  }
}
