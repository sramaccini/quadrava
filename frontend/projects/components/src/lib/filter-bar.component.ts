import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import type { FieldDefinition, FilterBarNode } from 'schema';
import { LookupComponent } from './lookup.component';
import { nextId, parseIsoDate, parseIsoDateTime, toIsoDate, toIsoDateTime } from './shared';

/** Barra dei filtri: scrive nello stato della schermata (`bind`), da cui i data source dipendono. */
@Component({
  selector: 'lc-filter-bar',
  imports: [FormsModule, LookupComponent, NzFormModule, NzInputModule, NzSelectModule, NzCheckboxModule, NzDatePickerModule, NzRadioModule, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    nz-form-item { margin-bottom: 0; }
    nz-select { min-width: 160px; }
    nz-select.many { min-width: 220px; }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="inline" role="search" (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, scope())) {
          <nz-form-item>
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, scope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, scope()) || field.name }}</nz-form-label>
            }
            <nz-form-control>
              @switch (field.type) {
                @case ('select') {
                  <nz-select [nzId]="id + field.name" nzAllowClear [nzPlaceHolder]="i18n.t('lc.all')" [ngModel]="value(field)" (ngModelChange)="change(field, $event)">
                    @for (option of field.options ?? []; track option) {
                      <nz-option [nzValue]="option" [nzLabel]="optionLabel(field, option)" />
                    }
                  </nz-select>
                }
                @case ('checkbox') {
                  <label nz-checkbox [ngModel]="value(field) === true" (ngModelChange)="change(field, $event || null)">{{ runtime().text(field.label, scope()) || field.name }}</label>
                }
                @case ('date') {
                  <nz-date-picker [nzId]="id + field.name" [ngModel]="dates()[field.name]" (ngModelChange)="change(field, toIso($event))" />
                }
                @case ('datetime') {
                  <nz-date-picker [nzId]="id + field.name" [nzShowTime]="{ nzFormat: 'HH:mm' }" nzFormat="dd/MM/yyyy HH:mm" [ngModel]="dates()[field.name]" (ngModelChange)="change(field, toIsoTime($event))" />
                }
                @case ('lookup') {
                  <lc-lookup [inputId]="id + field.name" [field]="field" [runtime]="runtime()" [scope]="scope()" [value]="value(field)" [disabled]="false" [placeholder]="i18n.t('lc.all')" (valueChange)="change(field, $event)" />
                }
                @case ('multiselect') {
                  <nz-select class="many" [nzId]="id + field.name" nzMode="multiple" nzAllowClear [nzPlaceHolder]="i18n.t('lc.all')" [ngModel]="lists()[field.name]" (ngModelChange)="change(field, $event.length ? $event : null)">
                    @for (option of field.options ?? []; track option) {
                      <nz-option [nzValue]="option" [nzLabel]="optionLabel(field, option)" />
                    }
                  </nz-select>
                }
                @case ('switch') {
                  <nz-switch [nzId]="id + field.name" [ngModel]="value(field) === true" (ngModelChange)="change(field, $event || null)" />
                }
                @case ('radio') {
                  <nz-radio-group [attr.id]="id + field.name" role="radiogroup" [attr.aria-label]="runtime().text(field.label, scope()) || field.name" [ngModel]="value(field) ?? ''" (ngModelChange)="change(field, $event)">
                    <label nz-radio-button nzValue="">{{ i18n.t('lc.all') }}</label>
                    @for (option of field.options ?? []; track option) {
                      <label nz-radio-button [nzValue]="option">{{ optionLabel(field, option) }}</label>
                    }
                  </nz-radio-group>
                }
                @default {
                  <input nz-input [id]="id + field.name" [type]="field.type === 'number' ? 'number' : 'text'" [value]="text(field)" (change)="change(field, $any($event.target).value)" />
                }
              }
            </nz-form-control>
          </nz-form-item>
        }
      }
    </form>
  `,
})
export class FilterBarComponent implements OnInit {
  readonly node = input.required<FilterBarNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  /** Etichetta di un'opzione: tradotta con `optionKey` (`<prefisso>.<valore>`), altrimenti il valore stesso. */
  protected optionLabel(field: FieldDefinition, option: string): string {
    return field.optionKey ? this.i18n.t(`${field.optionKey}.${option}`, {}, option) : option;
  }
  protected readonly id = nextId('lc-filter') + '-';
  /** Date dei filtri `date`, calcolate una volta per valore (vedi il form). */
  protected readonly dates = computed<Record<string, Date | null>>(() =>
    Object.fromEntries(
      this.node()
        .fields.filter((f) => f.type === 'date' || f.type === 'datetime')
        .map((f) => [f.name, f.type === 'date' ? parseIsoDate(this.value(f)) : parseIsoDateTime(this.value(f))]),
    ),
  );

  ngOnInit(): void {
    // Ogni filtro dichiarato esiste nello stato (nullo se non impostato): le espressioni `state.filtri.x` non vanno mai in errore.
    for (const field of this.node().fields) {
      if (this.runtime().getState(this.path(field)) === undefined) this.runtime().setState(this.path(field), null);
    }
  }

  protected path(field: FieldDefinition): string {
    return `${this.node().bind}.${field.name}`;
  }

  protected value(field: FieldDefinition): unknown {
    return this.runtime().getState(this.path(field)) ?? null;
  }

  protected text(field: FieldDefinition): string {
    const value = this.value(field);
    return value === null ? '' : String(value);
  }


  /** Valori delle selezioni multiple, calcolati una volta per valore: un elenco nuovo a ogni disegno farebbe ridisegnare la select senza fine. */
  protected readonly lists = computed<Record<string, string[]>>(() =>
    Object.fromEntries(
      this.node()
        .fields.filter((f) => f.type === 'multiselect')
        .map((f) => {
          const value = this.value(f);
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


  protected change(field: FieldDefinition, raw: unknown): void {
    let value: unknown = raw === '' || raw === undefined ? null : raw;
    if (field.type === 'number' && value !== null) value = Number(value);
    this.runtime().setState(this.path(field), value);
    // Un filtro nuovo riporta alla prima pagina.
    this.runtime().setState('page', 0);
  }
}
