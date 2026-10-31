import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, inputHints, passwordStrength, resolveDateLimit, transformValue, type RemoteChecks, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { FieldDefinition } from 'schema';
import { FileFieldComponent } from './file-field.component';
import { IconComponent } from './icon.component';
import { LookupComponent } from './lookup.component';
import { RepeaterComponent } from './repeater.component';
import { RichTextEditorComponent } from './rich-text-editor.component';
import { SuggestInputComponent } from './suggest-input.component';
import { parseIsoDate, parseIsoDateTime, toIsoDate, toIsoDateTime } from './shared';

/**
 * The control of a field (without label or error message, which stay with the host): used by the form, the
 * `input` component and the filter bar. It emits the value as it comes from the control; conversions (numbers)
 * are up to the host. In the `filter` variant empty means «all»: `placeholder` text, one extra choice
 * in the radio buttons, and checkboxes or switches turned off emit `null` (no filter) instead of `false`.
 * The validation of the field shows here too: the keyboard and autocomplete of its format, the limits of numbers
 * (`min`, `max`, `step`) and of dates (days out of `minDate` / `maxDate` cannot be chosen); its `transform` is applied
 * when leaving the field. A password field has a button that shows its text and, for a new password, a strength meter
 * (segments and text, announced politely); the estimate never sends the password anywhere. A text field with `suggest`
 * proposes words from a data source while typing (`lc-suggest-input`).
 */
@Component({
  selector: 'lc-field-control',
  imports: [FormsModule, LookupComponent, FileFieldComponent, IconComponent, RepeaterComponent, RichTextEditorComponent, SuggestInputComponent, NzButtonModule, NzInputModule, NzSelectModule, NzCheckboxModule, NzDatePickerModule, NzRadioModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    nz-select, nz-date-picker { width: 100%; }
    .password { position: relative; }
    .password input { padding-right: 40px; }
    .password .reveal { position: absolute; right: 2px; top: 50%; transform: translateY(-50%); }
    .strength { margin-top: 6px; }
    .bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
    .bars span { height: 4px; border-radius: 2px; background: var(--lc-color-border, #d9d9d9); }
    .bars[data-score='0'] span.on, .bars[data-score='1'] span.on { background: var(--lc-color-danger, #c62828); }
    .bars[data-score='2'] span.on { background: var(--lc-color-warning, #ad6800); }
    .bars[data-score='3'] span.on, .bars[data-score='4'] span.on { background: var(--lc-color-success, #2e7d32); }
    .level, .advice { margin: 4px 0 0; font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
  `,
  template: `
    @let f = field();
    @switch (f.type) {
      @case ('select') {
        <nz-select [nzId]="inputId()" nzAllowClear [nzPlaceHolder]="placeholder()" [nzDisabled]="disabled()" [ngModel]="selected()" (ngModelChange)="valueChange.emit($event)">
          @for (option of f.options ?? []; track option) {
            <nz-option [nzValue]="option" [nzLabel]="optionLabel(option)" />
          }
        </nz-select>
      }
      @case ('checkbox') {
        <label nz-checkbox [nzDisabled]="disabled()" [ngModel]="value() === true" (ngModelChange)="toggled($event)">
          {{ runtime().text(f.label, scope()) || f.name }}
        </label>
      }
      @case ('date') {
        <nz-date-picker [nzId]="inputId()" nzFormat="dd/MM/yyyy" [nzDisabled]="disabled()" [nzDisabledDate]="outOfRange()" [ngModel]="date()" (ngModelChange)="valueChange.emit(toIso($event))" />
      }
      @case ('datetime') {
        <nz-date-picker [nzId]="inputId()" [nzDisabled]="disabled()" [nzDisabledDate]="outOfRange()" [nzShowTime]="{ nzFormat: 'HH:mm' }" nzFormat="dd/MM/yyyy HH:mm" [ngModel]="date()" (ngModelChange)="valueChange.emit(toIsoTime($event))" />
      }
      @case ('textarea') {
        <textarea
          nz-input
          [id]="inputId()"
          [rows]="f.rows ?? 4"
          [value]="text()"
          [readonly]="disabled()"
          [attr.aria-invalid]="invalid()"
          (input)="typed($any($event.target).value, 'input')"
          (change)="typed($any($event.target).value, 'change')"
        ></textarea>
      }
      @case ('richtext') {
        <lc-rich-text-editor
          [inputId]="inputId()"
          [labelId]="labelId()"
          [value]="text() || null"
          [disabled]="disabled()"
          [invalid]="invalid()"
          [rows]="f.rows ?? 5"
          [commitOn]="commitOn()"
          (valueChange)="valueChange.emit($event)"
        />
      }
      @case ('radio') {
        @if (variant() === 'filter') {
          <nz-radio-group [attr.id]="inputId()" role="radiogroup" [attr.aria-label]="runtime().text(f.label, scope()) || f.name" [nzDisabled]="disabled()" [ngModel]="selected() ?? ''" (ngModelChange)="valueChange.emit($event)">
            <label nz-radio-button nzValue="">{{ placeholder() }}</label>
            @for (option of f.options ?? []; track option) {
              <label nz-radio-button [nzValue]="option">{{ optionLabel(option) }}</label>
            }
          </nz-radio-group>
        } @else {
          <nz-radio-group [attr.id]="inputId()" role="radiogroup" [attr.aria-label]="runtime().text(f.label, scope()) || f.name" [nzDisabled]="disabled()" [ngModel]="selected()" (ngModelChange)="valueChange.emit($event)">
            @for (option of f.options ?? []; track option) {
              <label nz-radio [nzValue]="option">{{ optionLabel(option) }}</label>
            }
          </nz-radio-group>
        }
      }
      @case ('switch') {
        <nz-switch [nzId]="inputId()" [nzDisabled]="disabled()" [ngModel]="value() === true" (ngModelChange)="toggled($event)" />
      }
      @case ('repeater') {
        <lc-repeater [field]="f" [runtime]="runtime()" [scope]="scope()" [value]="value()" [disabled]="disabled()" [submitted]="submitted()" [summary]="summary()" [labelId]="labelId()" [serverErrors]="cellErrors()" [remote]="remote()" (valueChange)="valueChange.emit($event)" />
      }
      @case ('file') {
        <lc-file-field [inputId]="inputId()" [field]="f" [runtime]="runtime()" [scope]="scope()" [value]="value()" [disabled]="disabled()" (valueChange)="valueChange.emit($event)" />
      }
      @case ('lookup') {
        <lc-lookup [inputId]="inputId()" [field]="f" [runtime]="runtime()" [scope]="scope()" [value]="value()" [disabled]="disabled()" [placeholder]="placeholder()" (valueChange)="valueChange.emit($event)" />
      }
      @case ('multiselect') {
        <nz-select [nzId]="inputId()" nzMode="multiple" nzAllowClear [nzPlaceHolder]="placeholder()" [nzDisabled]="disabled()" [ngModel]="list()" (ngModelChange)="multiple($event)">
          @for (option of f.options ?? []; track option) {
            <nz-option [nzValue]="option" [nzLabel]="optionLabel(option)" />
          }
        </nz-select>
      }
      @case ('password') {
        <div class="password">
          <input
            nz-input
            [id]="inputId()"
            [type]="revealed() ? 'text' : 'password'"
            [value]="text()"
            [readonly]="disabled()"
            [attr.autocomplete]="f.newPassword ? 'new-password' : 'current-password'"
            autocapitalize="off"
            spellcheck="false"
            [attr.aria-invalid]="invalid()"
            [attr.aria-describedby]="f.newPassword ? inputId() + '-strength' : null"
            (input)="typed($any($event.target).value, 'input')"
            (change)="typed($any($event.target).value, 'change')"
          />
          <button
            nz-button
            nzType="text"
            nzSize="small"
            type="button"
            class="reveal"
            [disabled]="disabled()"
            [attr.aria-label]="i18n.t(revealed() ? 'lc.password.hide' : 'lc.password.show')"
            [attr.aria-pressed]="revealed()"
            [attr.aria-controls]="inputId()"
            (click)="revealed.set(!revealed())"
          >
            <lc-icon [name]="revealed() ? 'password-hide' : 'password-show'" />
          </button>
        </div>
        @if (f.newPassword) {
          @let s = strength();
          <div class="strength" [id]="inputId() + '-strength'" aria-live="polite">
            <div class="bars" aria-hidden="true" [attr.data-score]="s.score">
              @for (segment of [0, 1, 2, 3]; track segment) {
                <span [class.on]="text() !== '' && segment <= s.score"></span>
              }
            </div>
            @if (text()) {
              <p class="level">{{ i18n.t('lc.strength.label', { level: i18n.t('lc.strength.' + s.score) }) }}</p>
              @if (s.score < 4 && s.hints.length) {
                <p class="advice">{{ i18n.t('lc.strength.hint.' + s.hints[0]) }}</p>
              }
            }
          </div>
        }
      }
      @default {
        @if (f.type === 'text' && f.suggest) {
          <lc-suggest-input [inputId]="inputId()" [spec]="f.suggest ?? null" [runtime]="runtime()" [scope]="scope()" [value]="text()" [disabled]="disabled()" [invalid]="invalid()" (typed)="typed($event.value, $event.event)" />
        } @else {
          <input
            nz-input
            [id]="inputId()"
            [type]="f.type"
            [value]="text()"
            [readonly]="disabled()"
            [attr.inputmode]="hints().inputMode ?? null"
            [attr.autocomplete]="f.sensitive ? 'off' : (hints().autocomplete ?? null)"
            [attr.min]="f.type === 'number' ? (f.min ?? null) : null"
            [attr.max]="f.type === 'number' ? (f.max ?? null) : null"
            [attr.step]="f.type === 'number' ? (f.step ?? (f.integer || f.decimals === 0 ? 1 : 'any')) : null"
            [attr.aria-invalid]="invalid()"
            (input)="typed($any($event.target).value, 'input')"
            (change)="typed($any($event.target).value, 'change')"
          />
        }
      }
    }
  `,
})
export class FieldControlComponent {
  readonly field = input.required<FieldDefinition>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly value = input<unknown>(null);
  readonly disabled = input(false);
  readonly inputId = input.required<string>();
  /** Id of the label (for repeatable rows, which use it as the name of the group). */
  readonly labelId = input<string>('');
  readonly invalid = input(false);
  /** For repeatable rows: errors of the cells visible after the first submit, and summary. */
  readonly submitted = input(false);
  readonly summary = input<string | null>(null);
  /** Values of the text fields of the form, which a password should not contain (`personalValues`). */
  readonly personal = input<readonly string[]>([]);
  /** For repeatable rows: errors of the cells returned by the service (`row/column` → message). */
  readonly cellErrors = input<Record<string, string>>({});
  /** For repeatable rows: the remote checks of the form, for the remote rules of the cells. */
  readonly remote = input<RemoteChecks | undefined>(undefined);
  /** Free text is emitted at every character (`input`) or only when leaving the field / with Enter (`change`). */
  readonly commitOn = input<'input' | 'change'>('input');
  /** `form`: field of a form; `filter`: search criterion, where empty means «all». */
  readonly variant = input<'form' | 'filter'>('form');
  /** Text of empty choice fields (and of the «all» choice in filters). */
  readonly placeholder = input('—');
  readonly valueChange = output<unknown>();

  protected readonly i18n = inject(I18n);
  /** The text of a password field is shown. */
  protected readonly revealed = signal(false);

  /** Dates and lists computed once per value: a new object at every render would make the control rewrite itself continuously (NG0103). */
  protected readonly date = computed(() => (this.field().type === 'date' ? parseIsoDate(this.value()) : parseIsoDateTime(this.value())));
  protected readonly list = computed(() => {
    const value = this.value();
    return Array.isArray(value) ? value.map(String) : [];
  });
  protected readonly selected = computed(() => {
    const value = this.value();
    return value === null || value === undefined || value === '' ? null : String(value);
  });
  /** Keyboard and autocomplete of the text box, from the format of the field. */
  protected readonly hints = computed(() => inputHints(this.field(), this.runtime().validatorRegistry));
  /** Days out of `minDate` / `maxDate` (compared by day); none without limits. */
  protected readonly outOfRange = computed(() => {
    const { minDate, maxDate } = this.field();
    if (!minDate && !maxDate) return undefined;
    // Relative limits (today, today+30d) are resolved once per field: the calendar of a day.
    const min = resolveDateLimit(minDate)?.slice(0, 10);
    const max = resolveDateLimit(maxDate)?.slice(0, 10);
    return (date: Date): boolean => {
      const day = toIsoDate(date);
      return day !== null && ((min !== undefined && day < min) || (max !== undefined && day > max));
    };
  });
  protected readonly text = computed(() => {
    const value = this.value();
    return value === null || value === undefined ? '' : String(value);
  });
  /** Strength of a new password; the text fields of the form (a name, an e-mail) make it weaker when they are inside it. */
  protected readonly strength = computed(() => passwordStrength(this.text(), this.personal()));

  /** Label of an option: translated with `optionKey` (`<prefix>.<value>`), otherwise the value itself. */
  protected optionLabel(option: string): string {
    const key = this.field().optionKey;
    return key ? this.i18n.t(`${key}.${option}`, {}, option) : option;
  }

  /** Checkbox or switch: in a filter, off means «no filter». */
  protected toggled(on: boolean): void {
    this.valueChange.emit(this.variant() === 'filter' && !on ? null : on);
  }

  /** Multiple choice: in a filter, no choice means «all». */
  protected multiple(values: string[]): void {
    this.valueChange.emit(this.variant() === 'filter' && values.length === 0 ? null : values);
  }

  /** Free text: at every character or when leaving the field (`commitOn`); leaving it also applies `transform`. */
  protected typed(value: string, event: 'input' | 'change'): void {
    if (event === 'change') this.valueChange.emit(transformValue(this.field(), value));
    else if (this.commitOn() === 'input') this.valueChange.emit(value);
  }

  protected toIso(date: Date | null): string | null {
    return toIsoDate(date);
  }

  protected toIsoTime(date: Date | null): string | null {
    return toIsoDateTime(date);
  }
}
