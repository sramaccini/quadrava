import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { codeMessage, formRules, I18n, isRequired, NO_PROBLEM, pointerSegments, RemoteChecks, rowsOf, runSteps, transformValue, type CompiledRule, type FieldCheck, type FieldError, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { BusyComponent } from './busy.component';
import { FieldControlComponent } from './field-control.component';
import { checkValue, personalValues, repeaterRows, validationEnv } from './field-validation';
import { dataItems, itemValue, screenItems, withItemValue, type FormItem } from './form-fields';
import { nextId } from './shared';

/**
 * Form: initial values come from the `source` data source (if it returns an object); actions receive `form` in the scope.
 * The fields are checked with their rules and with the rules of the form across fields (`validation`) after the first
 * submit attempt: errors block the actions, warnings only inform. Remote rules run while the user types, their outcome
 * shows as soon as it is known, and the form waits for those in progress before sending. Field errors returned by the
 * service (Problem with `errors`) go to their fields, or to the cells of a repeater, until those change.
 * With `fieldsFrom` more fields come from a data source, after those of the screen: their labels and options are data,
 * shown as they are; their values sit in the object `into` when it is given. The actions wait for those fields.
 */
@Component({
  selector: 'lc-form',
  imports: [BusyComponent, FieldControlComponent, NzAlertModule, NzFormModule, NzButtonModule, NzTooltipModule],
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
    @if (fieldsFailure(); as error) {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="error" nzShowIcon /></div>
    }
    <lc-busy [busy]="fieldsLoading()">
    <form nz-form ngNoForm nzLayout="vertical" novalidate [class.grid]="columns() > 1" [class.wide]="hasRows()" [style.--lc-form-columns]="columns()" (submit)="$event.preventDefault()">
      @for (item of items(); track item.key) {
        @let field = item.field;
        @if (runtime().isVisible(field, fieldScope())) {
          <nz-form-item [style.--lc-field-span]="span(field)">
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + item.key" [id]="id + item.key + '-label'" [nzRequired]="required(item)" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, fieldScope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ item.label ?? (runtime().text(field.label, fieldScope()) || field.name) }}</nz-form-label>
            }
            @let problem = shown(item);
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
                [value]="valueOf(item)"
                [disabled]="readOnly(field)"
                [inputId]="id + item.key"
                [labelId]="id + item.key + '-label'"
                [labelText]="item.label"
                [optionLabels]="item.optionLabels"
                [invalid]="!!problem.error"
                [submitted]="submitted()"
                [summary]="problem.error ?? problem.warning"
                [cellErrors]="cellErrors()[item.key] ?? {}"
                [personal]="personal()"
                [remote]="remote()"
                (valueChange)="set(item, $event)"
              />
            </nz-form-control>
          </nz-form-item>
        }
      }
      <div class="actions">
        @for (action of node().actions ?? []; track $index) {
          @if (runtime().isVisible(action, fieldScope())) {
            <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, fieldScope()) : null">
              <button nz-button nzType="primary" type="button" [nzLoading]="busy()" [disabled]="busy() || fieldsLoading() || !runtime().isEnabled(action, fieldScope())" (click)="run(action)">
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
    </lc-busy>
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

  /**
   * The data of the form's source. A computed of its own: the state of the screen's sources changes with every call and
   * lookup, and only new data of this source may replace what the user is typing.
   */
  private readonly sourceData = computed(() => {
    const source = this.node().source;
    return source ? this.runtime().source(source).data : null;
  });
  /** The data source of the fields that are data (`fieldsFrom`). */
  private readonly fieldsSource = computed(() => {
    const from = this.node().fieldsFrom;
    return from ? this.runtime().source(from.source) : null;
  });
  protected readonly fieldsLoading = computed(() => this.fieldsSource()?.status === 'loading');
  protected readonly fieldsFailure = computed(() => (this.fieldsSource()?.status === 'error' ? (this.fieldsSource()?.error ?? null) : null));
  /** The fields of the screen, then those of the data source. */
  protected readonly items = computed<FormItem[]>(() => {
    const node = this.node();
    const own = screenItems(node.fields);
    if (!node.fieldsFrom) return own;
    return [...own, ...dataItems(rowsOf(this.fieldsSource()?.data), node.fieldsFrom, new Set(node.fields.map((f) => f.name)))];
  });

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
      const data = this.sourceData();
      if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        untracked(() => this.values.set(this.normalize({ ...this.empty(), ...(data as Record<string, unknown>) })));
      }
    });
  }

  /**
   * Every declared field exists in the values (null), and so does the object of the data fields: `form.field`
   * expressions do not fail before the data arrives.
   */
  private empty(): Record<string, unknown> {
    const into = this.node().fieldsFrom?.into;
    return { ...Object.fromEntries(this.node().fields.map((f) => [f.name, null])), ...(into ? { [into]: {} } : {}) };
  }

  /** Repeatable-rows fields start with at least `minRows` empty rows; the object of the data fields is an object. */
  private normalize(values: Record<string, unknown>): Record<string, unknown> {
    const out = { ...values };
    const into = this.node().fieldsFrom?.into;
    if (into && (out[into] === null || typeof out[into] !== 'object' || Array.isArray(out[into]))) out[into] = {};
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

  protected valueOf(item: FormItem): unknown {
    return itemValue(this.values(), item, this.node().fieldsFrom?.into);
  }

  protected set(item: FormItem, raw: unknown): void {
    const field = item.field;
    const value = field.type === 'number' && raw !== '' && raw !== null ? Number(raw) : raw;
    this.values.update((current) => withItemValue(current, item, this.node().fieldsFrom?.into, value));
    // A field changed by the user is no longer the one the service rejected.
    if (item.key in this.serverErrors()) this.serverErrors.update(({ [item.key]: _, ...rest }) => rest);
    if (item.key in this.cellErrors()) this.cellErrors.update(({ [item.key]: _, ...rest }) => rest);
  }

  /** The rules of the form that concern an item: they name only the fields of the screen. */
  private rulesOf(item: FormItem): readonly CompiledRule[] | undefined {
    return item.label === null ? this.crossRules().get(item.field.name) : undefined;
  }

  /** The asterisk of the label: required, or required now by a conditional rule. */
  protected required(item: FormItem): boolean {
    return isRequired(item.field, this.env(), this.rulesOf(item));
  }

  /**
   * Error or warning of the field: after the first submit attempt; a remote check (running or done) as soon as it is
   * known; an error of the service until the field changes.
   */
  protected shown(item: FormItem): FieldCheck {
    const server = this.serverErrors()[item.key];
    if (server) return { error: server, warning: null };
    const check = this.check(item);
    return this.submitted() || check.pending || check.remote ? check : NO_PROBLEM;
  }

  private check(item: FormItem): FieldCheck {
    return checkValue(item.field, this.valueOf(item), this.env(), this.rulesOf(item));
  }

  /** The values with the `transform` of every field applied, the data fields included. */
  private transformed(values: Record<string, unknown>): Record<string, unknown> {
    const into = this.node().fieldsFrom?.into;
    return this.items().reduce((out, item) => {
      const value = itemValue(out, item, into);
      return value === undefined ? out : withItemValue(out, item, into, transformValue(item.field, value));
    }, values);
  }

  /**
   * Places the field errors of the service on the fields (and the cells of repeaters); returns how many it placed. An
   * error on a data field kept in `into` has the path of the object (`/custom/customer`).
   */
  private placeServerErrors(errors: readonly FieldError[]): number {
    const fields: Record<string, string> = {};
    const cells: Record<string, Record<string, string>> = {};
    const into = this.node().fieldsFrom?.into;
    let placed = 0;
    for (const { path, code, params } of errors) {
      const segments = pointerSegments(path);
      const inData = into !== undefined && segments[0] === into && segments.length === 2;
      const [name, row, column, ...rest] = inData ? [`${into}.${segments[1]}`] : segments;
      const item = this.items().find((i) => i.key === name);
      if (!item || rest.length) continue;
      const message = codeMessage(this.i18n, code, params);
      if (item.field.type === 'repeater' && row !== undefined && column !== undefined && /^\d+$/.test(row)) {
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
    if (this.busy() || this.fieldsLoading()) return;
    this.submitted.set(true);
    this.serverErrors.set({});
    this.cellErrors.set({});
    // The steps receive the values as they are checked: after `transform` (usually already applied when leaving the field).
    this.values.update((values) => this.transformed(values));
    this.busy.set(true);
    try {
      // The remote checks still waiting for their pause start now, and the form waits for their outcome (a value changed
      // just before the click is scheduled by the check itself: one more round).
      const visible = this.items().filter((i) => this.runtime().isVisible(i.field, this.fieldScope()));
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
