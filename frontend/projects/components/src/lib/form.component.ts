import { afterEveryRender, afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, output, signal, untracked } from '@angular/core';
import { codeMessage, formRules, I18n, isRequired, NO_PROBLEM, pointerSegments, RemoteChecks, rowsOf, runSteps, transformValue, type CompiledRule, type FieldCheck, type FieldError, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition, FieldDefinition, FormNode } from 'schema';
import { BusyComponent } from './busy.component';
import { FieldControlComponent } from './field-control.component';
import { labelInControl } from './file-field.component';
import { IconComponent } from './icon.component';
import { confirmsOnPick, emptyAsNull, inlineText, isEmptyValue, isInlineType, isMultiLine, isToggle, sameValue } from './inline-edit';
import { LookupComponent } from './lookup.component';
import { MarkdownComponent } from './markdown.component';
import { checkValue, personalValues, repeaterRows, validationEnv } from './field-validation';
import { dataItems, itemValue, screenItems, withItemValue, type FormItem, ownValues } from './form-fields';
import { nextId } from './shared';

/**
 * Form: initial values come from the `source` data source (if it returns an object); actions receive `form` in the scope,
 * the whole record, and `formFields`, only the values of the fields of the form ({@link ownValues}).
 * The fields are checked with their rules and with the rules of the form across fields (`validation`) after the first
 * submit attempt: errors block the actions, warnings only inform. Remote rules run while the user types, their outcome
 * shows as soon as it is known, and the form waits for those in progress before sending. Field errors returned by the
 * service (Problem with `errors`) go to their fields, or to the cells of a repeater, until those change.
 * With `fieldsFrom` more fields come from a data source, after those of the screen: their labels and options are data,
 * shown as they are; their values sit in the object `into` when it is given. The actions wait for those fields.
 * The fields sit in a grid (`columns`, `span`) or, with `layout: "flow"`, one after the other while they fit: a field
 * with `width` takes that width, one without it a whole line (its input at most 560px), one with `width: "full"` the
 * whole line with no limit.
 * With `edit: "inline"` the fields show their values as text (a heading with `display: "heading"`, formatted text for
 * richtext, `emptyText` when empty); a click, Enter or Space opens the editor of that field only, focused. Single-line
 * fields are confirmed with ✓ or Enter, multi-line ones with Save or Ctrl+Enter, a select or a lookup (opened with its
 * list) by choosing a value; ✕, Cancel or Escape restore the value. Confirming checks the field, then runs `onSave`
 * with `field` and `value`: an error keeps the editor open. A field that cannot be changed (readOnlyIf) is only text.
 * Checkboxes and switches stay controls: every change runs `onSave` at once and goes back if it fails.
 */
@Component({
  selector: 'lc-form',
  imports: [BusyComponent, FieldControlComponent, IconComponent, LookupComponent, MarkdownComponent, NzAlertModule, NzFormModule, NzButtonModule, NzTooltipModule],
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
    /* Flow: the fields with a width side by side while they fit, the others on a line of their own. */
    form.flow { max-width: none; display: flex; flex-wrap: wrap; align-items: flex-start; column-gap: 16px; }
    /* A column, so the item is as wide as the wider of label and input (a wrapping row would add them up). */
    form.flow > nz-form-item { flex: 0 1 auto; min-width: 0; flex-flow: column nowrap; }
    form.flow > nz-form-item.line { flex-basis: 100%; }
    form.flow > nz-form-item.line:not(.full) lc-field-control { max-width: 560px; }
    form.flow > .actions { flex-basis: 100%; }
    /* The buttons wrap when they do not fit, instead of widening the page (WCAG 1.4.10, reflow). */
    .actions { display: flex; flex-wrap: wrap; gap: var(--lc-gap, 12px); }
    .actions lc-icon { margin-inline-end: 8px; }
    .actions:empty { display: none; }
    /* Inline editing: the value as text, a quiet background on hover and a ring on focus say it can be opened. */
    .view { min-height: 32px; padding: 4px 8px; margin-inline: -8px; border-radius: var(--lc-radius, 6px); overflow-wrap: anywhere; }
    .view.text { white-space: pre-wrap; }
    .view.editable { cursor: pointer; }
    .view.editable:hover { background: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 12%, transparent); }
    .view.editable:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: 0; }
    .view.heading { font-size: 24px; font-weight: 600; line-height: 1.3; }
    .view .empty { color: var(--lc-color-muted, #5d6b7a); font-weight: normal; }
    .view.heading .empty { font-size: 16px; }
    .heading-editor ::ng-deep input { font-size: 20px; font-weight: 600; }
    .editor-actions { display: flex; gap: 8px; margin-top: 8px; }
    .editor-actions.icons { justify-content: flex-end; gap: 4px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (fieldsFailure(); as error) {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="error" nzShowIcon /></div>
    }
    <lc-busy [busy]="fieldsLoading()">
    <form nz-form ngNoForm nzLayout="vertical" novalidate [class.grid]="!flow() && columns() > 1" [class.flow]="flow()" [class.wide]="hasRows()" [style.--lc-form-columns]="columns()" (submit)="$event.preventDefault()">
      @for (item of items(); track item.key) {
        @let field = item.field;
        @if (runtime().isVisible(field, fieldScope())) {
          <nz-form-item [attr.data-lc-input]="id + item.key" [attr.data-lc-required]="required(item) ? '' : null" [style.--lc-field-span]="span(field)" [class.line]="flow() && (!field.width || field.width === 'full')" [class.full]="field.width === 'full'">
            @let inlineField = inline() && isInlineType(field);
            @let inlineToggle = inline() && isToggle(field);
            @if (!labelInControl(field)) {
              <nz-form-label [class.sr-only]="inlineField && field.display === 'heading'" [nzFor]="id + item.key" [id]="id + item.key + '-label'" [nzRequired]="required(item)" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, fieldScope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ item.label ?? (runtime().text(field.label, fieldScope()) || field.name) }}</nz-form-label>
            }
            @let problem = shown(item);
            <nz-form-control
              [nzValidateStatus]="field.type === 'repeater' ? '' : problem.error ? 'error' : problem.pending ? 'validating' : problem.warning ? 'warning' : ''"
              [nzHasFeedback]="!!problem.pending"
              [nzErrorTip]="problem.error ?? undefined"
              [nzWarningTip]="problem.warning ?? undefined"
            >
              @if (inlineField && editing() !== item.key) {
                @let locked = readOnly(field);
                @let value = valueOf(item);
                <div
                  class="view"
                  [id]="id + item.key + '-view'"
                  [class.editable]="!locked"
                  [class.heading]="field.display === 'heading'"
                  [class.text]="field.type !== 'richtext'"
                  [attr.role]="locked ? null : 'button'"
                  [attr.tabindex]="locked ? null : 0"
                  [attr.aria-labelledby]="locked ? null : id + item.key + '-label ' + id + item.key + '-view'"
                  [attr.title]="locked ? null : i18n.t('lc.inline.edit', { label: item.label ?? (runtime().text(field.label, fieldScope()) || field.name) })"
                  (click)="!locked && edit(item)"
                  (keydown.enter)="!locked && edit(item, $event)"
                  (keydown.space)="!locked && edit(item, $event)"
                >
                  @if (isEmptyValue(value)) {
                    <span class="empty">{{ locked ? '—' : field.emptyText ? runtime().text(field.emptyText, fieldScope()) : i18n.t('lc.inline.empty') }}</span>
                  } @else if (field.type === 'richtext') {
                    <lc-markdown [source]="$any(value)" />
                  } @else if (field.type === 'lookup') {
                    <lc-lookup [textOnly]="true" [field]="field" [runtime]="runtime()" [scope]="fieldScope()" [value]="value" />
                  } @else {
                    {{ shownText(item, value) }}
                  }
                </div>
              } @else {
              <div [class.heading-editor]="inlineField && field.display === 'heading'" (keydown)="inlineField && editorKey($event, item)">
              <lc-field-control
                [field]="field"
                [runtime]="runtime()"
                [scope]="fieldScope()"
                [value]="valueOf(item)"
                [disabled]="readOnly(field) || ((inlineField || inlineToggle) && busy())"
                [openOnStart]="inlineField && confirmsOnPick(field)"
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
                (valueChange)="inlineToggle ? toggle(item, $event) : inlineField ? changed(item, $event) : set(item, $event)"
              />
              @if (inlineField) {
                @if (isMultiLine(field)) {
                  <div class="editor-actions">
                    <button nz-button nzType="primary" type="button" [nzLoading]="busy()" (click)="save(item)">{{ i18n.t('lc.inline.save') }}</button>
                    <button nz-button type="button" [disabled]="busy()" (click)="cancel(item)">{{ i18n.t('lc.cancel') }}</button>
                  </div>
                } @else {
                  <div class="editor-actions icons">
                    @if (!confirmsOnPick(field)) {
                      <button nz-button nzSize="small" type="button" [nzLoading]="busy()" [attr.aria-label]="i18n.t('lc.confirm')" (click)="save(item)">
                        @if (!busy()) {
                          <lc-icon name="check" />
                        }
                      </button>
                    }
                    <button nz-button nzSize="small" type="button" [disabled]="busy()" [attr.aria-label]="i18n.t('lc.cancel')" (click)="cancel(item)"><lc-icon name="close" /></button>
                  </div>
                }
              }
              </div>
              }
            </nz-form-control>
          </nz-form-item>
        }
      }
      <div class="actions">
        @for (action of node().actions ?? []; track $index) {
          @if (runtime().isVisible(action, fieldScope())) {
            <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, fieldScope()) : null">
              <button nz-button nzType="primary" type="button" [nzLoading]="busy()" [disabled]="busy() || fieldsLoading() || !runtime().isEnabled(action, fieldScope())" (click)="run(action)">
                @if (action.icon && !busy()) {
                  <lc-icon [name]="action.icon" />
                }
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
  /** A checkbox and a drop zone draw their label themselves. */
  protected readonly labelInControl = labelInControl;
  protected readonly isInlineType = isInlineType;
  protected readonly isMultiLine = isMultiLine;
  protected readonly confirmsOnPick = confirmsOnPick;
  protected readonly isToggle = isToggle;
  protected readonly isEmptyValue = isEmptyValue;
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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  /**
   * After every render: the control of a required field says so (aria-required), and the control of a field with a
   * message (error or warning) points to it (aria-describedby), keeping any description of its own. The controls are drawn
   * by several components (inputs, selects, pickers): they are found by the id given to them. An attribute is written
   * only when it changes: some controls watch their own DOM, and a write would render them again.
   */
  private readonly ariaLinks = afterEveryRender(() => {
    const set = (element: HTMLElement, name: string, value: string | null): void => {
      if (element.getAttribute(name) === value) return;
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    };
    for (const item of this.host.querySelectorAll<HTMLElement>('nz-form-item[data-lc-input]')) {
      const id = item.dataset['lcInput']!;
      const control = item.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
      if (!control) continue;
      set(control, 'aria-required', item.hasAttribute('data-lc-required') ? 'true' : null);
      const message = item.querySelector<HTMLElement>('.ant-form-item-explain-error, .ant-form-item-explain-warning');
      const own = (control.getAttribute('aria-describedby') ?? '').split(' ').filter((ref) => ref && ref !== id + '-message');
      if (message) set(message, 'id', id + '-message');
      const refs = message ? [...own, id + '-message'] : own;
      set(control, 'aria-describedby', refs.length ? refs.join(' ') : null);
    }
  });
  protected readonly values = signal<Record<string, unknown>>({});
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);

  /** Inline editing: the values as text, one field at a time opened. */
  protected readonly inline = computed(() => this.node().edit === 'inline');
  /** Key of the field being edited inline; its value when it was opened; whether confirming it was tried. */
  protected readonly editing = signal<string | null>(null);
  private before: unknown = null;
  private readonly tried = signal(false);

  /** The form contains repeatable rows. */
  protected readonly hasRows = computed(() => this.node().fields.some((f) => f.type === 'repeater'));

  /** Fields one after the other by their width, instead of the grid. */
  protected readonly flow = computed(() => this.node().layout === 'flow');

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

  protected readonly fieldScope = computed<Scope>(() => ({
    ...this.scope(),
    form: this.values(),
    formFields: ownValues(this.values(), this.items(), this.node().fieldsFrom?.into),
  }));

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
    // An emptied field that is not text (a number, a date, a choice) is null, as in the filter bar and the rows.
    const empty = emptyAsNull(field, raw);
    const value = field.type === 'number' && empty !== null && empty !== undefined ? Number(empty) : empty;
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
    const after = this.submitted() || (this.tried() && this.editing() === item.key);
    return after || check.pending || check.remote ? check : NO_PROBLEM;
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
   * Places the field errors of the service on the fields (and the cells of repeaters); returns how many it placed. A
   * path is placed only when it ends exactly on a visible field (`/email`), on a data field kept in `into`
   * (`/custom/customer`) or on a cell of a row that exists (`/lines/0/code`); any other path, deeper or unknown, is
   * left to the default message. With `errorPath` the values of the form sit below that path in the body (`/order`):
   * only the paths below it are read, without it.
   */
  private placeServerErrors(errors: readonly FieldError[]): number {
    const fields: Record<string, string> = {};
    const cells: Record<string, Record<string, string>> = {};
    const into = this.node().fieldsFrom?.into;
    const prefix = this.node().errorPath ?? '';
    let placed = 0;
    for (const { path, code, params } of errors) {
      if (!path.startsWith(`${prefix}/`)) continue;
      const segments = pointerSegments(path.slice(prefix.length));
      const inData = into !== undefined && segments[0] === into && segments.length === 2;
      const [name, row, column, ...rest] = inData ? [`${into}.${segments[1]}`] : segments;
      const item = this.items().find((i) => i.key === name);
      if (!item || rest.length || !this.runtime().isVisible(item.field, this.fieldScope())) continue;
      const message = codeMessage(this.i18n, code, params);
      if (row === undefined) {
        fields[name] = message;
      } else if (item.field.type === 'repeater' && column !== undefined && this.isCell(item, row, column)) {
        cells[name] = { ...cells[name], [`${row}/${column}`]: message };
      } else {
        continue;
      }
      placed++;
    }
    this.serverErrors.set(fields);
    this.cellErrors.set(cells);
    return placed;
  }

  /** Whether `row` and `column` name a cell drawn by the repeater: a row that exists, a field of its rows. */
  private isCell(item: FormItem, row: string, column: string): boolean {
    return /^(0|[1-9]\d*)$/.test(row) && Number(row) < repeaterRows(this.valueOf(item)).length && (item.field.fields ?? []).some((f) => f.name === column);
  }

  /** Text of a value in the read view of an inline form. */
  protected shownText(item: FormItem, value: unknown): string {
    const labels = { yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key: string, fallback: string) => this.i18n.t(key, {}, fallback) };
    return inlineText(item.field, value, this.i18n.intlLocale(), labels, item.optionLabels);
  }

  /** Opens the editor of a field (closing, unchanged, the one already open) and moves the focus into it. */
  protected edit(item: FormItem, event?: Event): void {
    event?.preventDefault();
    if (this.busy()) return;
    const open = this.items().find((i) => i.key === this.editing());
    if (open) this.restore(open);
    this.before = this.valueOf(item);
    this.tried.set(false);
    this.editing.set(item.key);
    this.focusAfterRender(this.id + item.key);
  }

  /** Keys of an open editor: Escape cancels; Enter confirms a single-line field, Ctrl+Enter (or ⌘+Enter) a multi-line one. */
  protected editorKey(event: KeyboardEvent, item: FormItem): void {
    if (event.key === 'Escape') {
      // With its list of options or its calendar open, Escape closes only that.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.ant-select-open') || ((item.field.type === 'date' || item.field.type === 'datetime') && target?.ownerDocument.querySelector('.ant-picker-dropdown'))) return;
      event.preventDefault();
      event.stopPropagation();
      this.cancel(item);
      return;
    }
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    // A single line confirms with Enter only from its text box: in a list of options Enter chooses.
    const textBox = event.target instanceof HTMLInputElement && (item.field.type === 'text' || item.field.type === 'number');
    if (isMultiLine(item.field) ? event.ctrlKey || event.metaKey : textBox) {
      event.preventDefault();
      // A text box applies its transform when it changes: done before saving.
      if (event.target instanceof HTMLInputElement) event.target.dispatchEvent(new Event('change'));
      void this.save(item);
    }
  }

  /**
   * A change in the editor of an inline field. A select or a lookup confirms at once (clearing it confirms null). A
   * change that arrives when the editor is closed is ignored: a text box removed after Escape still reports its text when
   * it loses the focus, and must not overwrite the value put back.
   */
  protected changed(item: FormItem, value: unknown): void {
    if (this.editing() !== item.key) return;
    this.set(item, value);
    if (confirmsOnPick(item.field)) void this.save(item);
  }

  /** A checkbox or switch of an inline form: the change is saved at once and goes back if the checks or the steps fail. */
  protected async toggle(item: FormItem, value: unknown): Promise<void> {
    if (this.busy()) return;
    const open = this.items().find((i) => i.key === this.editing());
    if (open) this.restore(open);
    this.before = this.valueOf(item);
    this.set(item, value);
    this.editing.set(item.key);
    await this.save(item);
    if (this.editing() === item.key) this.restore(item);
  }

  protected cancel(item: FormItem): void {
    if (this.busy()) return;
    this.restore(item);
    this.focusAfterRender(this.id + item.key + '-view');
  }

  /** Puts back the value the field had when it was opened and closes its editor. */
  private restore(item: FormItem): void {
    this.values.update((current) => withItemValue(current, item, this.node().fieldsFrom?.into, this.before));
    if (item.key in this.serverErrors()) this.serverErrors.update(({ [item.key]: _, ...rest }) => rest);
    this.tried.set(false);
    this.editing.set(null);
  }

  /** Confirms an inline field: its checks, then `onSave` with `field` and `value`; the editor closes if they succeed. */
  protected async save(item: FormItem): Promise<void> {
    if (this.busy() || this.editing() !== item.key) return;
    const into = this.node().fieldsFrom?.into;
    this.tried.set(true);
    this.serverErrors.set({});
    this.values.update((values) => {
      const value = itemValue(values, item, into);
      return value === undefined ? values : withItemValue(values, item, into, emptyAsNull(item.field, transformValue(item.field, value)));
    });
    this.busy.set(true);
    try {
      let check = this.check(item);
      for (let round = 0; round < 3 && check.pending; round++) {
        await this.remote().settle();
        check = this.check(item);
      }
      if (check.error !== null || check.pending) return;
      const value = this.valueOf(item);
      const steps = this.node().onSave;
      if (steps?.length && !sameValue(value, this.before)) {
        const ok = await runSteps(this.runtime(), steps, { ...this.fieldScope(), field: item.key, value }, { onFieldErrors: (errors) => this.placeServerErrors(errors) });
        if (!ok) return;
      }
      this.tried.set(false);
      this.editing.set(null);
      this.focusAfterRender(this.id + item.key + '-view');
    } finally {
      this.busy.set(false);
    }
  }

  private focusAfterRender(id: string): void {
    afterNextRender(() => this.host.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)?.focus(), { injector: this.injector });
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
