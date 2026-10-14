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
 * Il controllo di un campo (senza etichetta né messaggio d'errore, che restano a chi lo ospita): lo usano il form, il
 * componente `input` e la barra dei filtri. Emette il valore così come arriva dal controllo; le conversioni (numeri)
 * spettano a chi lo ospita. Nella variante `filter` il vuoto significa «tutti»: segnaposto `placeholder`, una scelta in
 * più nei pulsanti di scelta, e caselle o interruttori spenti emettono `null` (nessun filtro) invece di `false`.
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
  /** Id dell'etichetta (per le righe ripetibili, che la usano come nome del gruppo). */
  readonly labelId = input<string>('');
  readonly invalid = input(false);
  /** Per le righe ripetibili: errori delle celle visibili dopo il primo invio, e riepilogo. */
  readonly submitted = input(false);
  readonly summary = input<string | null>(null);
  /** Il testo libero si emette a ogni carattere (`input`) o solo uscendo dal campo / con Invio (`change`). */
  readonly commitOn = input<'input' | 'change'>('input');
  /** `form`: campo di un modulo; `filter`: criterio di ricerca, dove il vuoto vale «tutti». */
  readonly variant = input<'form' | 'filter'>('form');
  /** Testo dei campi a scelta vuoti (e della scelta «tutti» nei filtri). */
  readonly placeholder = input('—');
  readonly valueChange = output<unknown>();

  private readonly i18n = inject(I18n);

  /** Date e liste calcolate una volta per valore: un oggetto nuovo a ogni disegno farebbe riscrivere il controllo di continuo (NG0103). */
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

  /** Etichetta di un'opzione: tradotta con `optionKey` (`<prefisso>.<valore>`), altrimenti il valore stesso. */
  protected optionLabel(option: string): string {
    const key = this.field().optionKey;
    return key ? this.i18n.t(`${key}.${option}`, {}, option) : option;
  }

  /** Casella o interruttore: in un filtro spento vuol dire «nessun filtro». */
  protected toggled(on: boolean): void {
    this.valueChange.emit(this.variant() === 'filter' && !on ? null : on);
  }

  /** Scelta multipla: in un filtro nessuna scelta vuol dire «tutti». */
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
