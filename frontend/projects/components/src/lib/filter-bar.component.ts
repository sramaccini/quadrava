import { ChangeDetectionStrategy, Component, computed, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ScreenRuntime, Scope } from 'core';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import type { FieldDefinition, FilterBarNode } from 'schema';
import { nextId, parseIsoDate, toIsoDate } from './shared';

/** Barra dei filtri: scrive nello stato della schermata (`bind`), da cui i data source dipendono. */
@Component({
  selector: 'lc-filter-bar',
  imports: [FormsModule, NzFormModule, NzInputModule, NzSelectModule, NzCheckboxModule, NzDatePickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    nz-form-item { margin-bottom: 0; }
    nz-select { min-width: 160px; }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="inline" role="search" (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, scope())) {
          <nz-form-item>
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, scope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ field.label ?? field.name }}</nz-form-label>
            }
            <nz-form-control>
              @switch (field.type) {
                @case ('select') {
                  <nz-select [nzId]="id + field.name" nzAllowClear nzPlaceHolder="Tutti" [ngModel]="value(field)" (ngModelChange)="change(field, $event)">
                    @for (option of field.options ?? []; track option) {
                      <nz-option [nzValue]="option" [nzLabel]="option" />
                    }
                  </nz-select>
                }
                @case ('checkbox') {
                  <label nz-checkbox [ngModel]="value(field) === true" (ngModelChange)="change(field, $event || null)">{{ field.label ?? field.name }}</label>
                }
                @case ('date') {
                  <nz-date-picker [nzId]="id + field.name" [ngModel]="dates()[field.name]" (ngModelChange)="change(field, toIso($event))" />
                }
                @default {
                  <input nz-input [id]="id + field.name" [type]="field.type" [value]="text(field)" (change)="change(field, $any($event.target).value)" />
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
  protected readonly id = nextId('lc-filter') + '-';
  /** Date dei filtri `date`, calcolate una volta per valore (vedi il form). */
  protected readonly dates = computed<Record<string, Date | null>>(() =>
    Object.fromEntries(this.node().fields.filter((f) => f.type === 'date').map((f) => [f.name, parseIsoDate(this.value(f))])),
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


  protected toIso(date: Date | null): string | null {
    return toIsoDate(date);
  }

  protected change(field: FieldDefinition, raw: unknown): void {
    let value: unknown = raw === '' || raw === undefined ? null : raw;
    if (field.type === 'number' && value !== null) value = Number(value);
    this.runtime().setState(this.path(field), value);
    // Un filtro nuovo riporta alla prima pagina.
    this.runtime().setState('page', 0);
  }
}
