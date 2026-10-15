import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { FieldDefinition } from 'schema';
import { FileFieldComponent } from './file-field.component';
import { LookupComponent } from './lookup.component';
import { RepeaterComponent } from './repeater.component';
import { RichTextEditorComponent } from './rich-text-editor.component';
import { parseIsoDate, parseIsoDateTime, toIsoDate, toIsoDateTime } from './shared';

/**
 * The control of a field (without label or error message, which stay with the host): used by the form, the
 * `input` component and the filter bar. It emits the value as it comes from the control; conversions (numbers)
 * are up to the host. In the `filter` variant empty means «all»: `placeholder` text, one extra choice
 * in the radio buttons, and checkboxes or switches turned off emit `null` (no filter) instead of `false`.
 */
@Component({
  selector: 'lc-field-control',
  imports: [FormsModule, LookupComponent, FileFieldComponent, RepeaterComponent, RichTextEditorComponent, NzInputModule, NzSelectModule, NzCheckboxModule, NzDatePickerModule, NzRadioModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    nz-select, nz-date-picker { width: 100%; }
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
        <nz-date-picker [nzId]="inputId()" nzFormat="dd/MM/yyyy" [nzDisabled]="disabled()" [ngModel]="date()" (ngModelChange)="valueChange.emit(toIso($event))" />
      }
      @case ('datetime') {
        <nz-date-picker [nzId]="inputId()" [nzDisabled]="disabled()" [nzShowTime]="{ nzFormat: 'HH:mm' }" nzFormat="dd/MM/yyyy HH:mm" [ngModel]="date()" (ngModelChange)="valueChange.emit(toIsoTime($event))" />
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
        <lc-repeater [field]="f" [runtime]="runtime()" [scope]="scope()" [value]="value()" [disabled]="disabled()" [submitted]="submitted()" [summary]="summary()" [labelId]="labelId()" (valueChange)="valueChange.emit($event)" />
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
      @default {
        <input
          nz-input
          [id]="inputId()"
          [type]="f.type"
          [value]="text()"
          [readonly]="disabled()"
          [attr.autocomplete]="f.sensitive ? 'off' : null"
          [attr.aria-invalid]="invalid()"
          (input)="typed($any($event.target).value, 'input')"
          (change)="typed($any($event.target).value, 'change')"
        />
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
  /** Free text is emitted at every character (`input`) or only when leaving the field / with Enter (`change`). */
  readonly commitOn = input<'input' | 'change'>('input');
  /** `form`: field of a form; `filter`: search criterion, where empty means «all». */
  readonly variant = input<'form' | 'filter'>('form');
  /** Text of empty choice fields (and of the «all» choice in filters). */
  readonly placeholder = input('—');
  readonly valueChange = output<unknown>();

  private readonly i18n = inject(I18n);

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
  protected readonly text = computed(() => {
    const value = this.value();
    return value === null || value === undefined ? '' : String(value);
  });

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

  protected typed(value: string, event: 'input' | 'change'): void {
    if (event === this.commitOn()) this.valueChange.emit(value);
  }

  protected toIso(date: Date | null): string | null {
    return toIsoDate(date);
  }

  protected toIsoTime(date: Date | null): string | null {
    return toIsoDateTime(date);
  }
}
