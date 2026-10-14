import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit } from '@angular/core';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzFormModule } from 'ng-zorro-antd/form';
import type { FieldDefinition, FilterBarNode } from 'schema';
import { FieldControlComponent } from './field-control.component';
import { nextId } from './shared';

/** Barra dei filtri: scrive nello stato della schermata (`bind`), da cui i data source dipendono. */
@Component({
  selector: 'lc-filter-bar',
  imports: [FieldControlComponent, NzFormModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    nz-form-item { margin-bottom: 0; }
    lc-field-control { min-width: 160px; }
  `,
  template: `
    <form nz-form ngNoForm nzLayout="inline" role="search" (submit)="$event.preventDefault()">
      <!-- Un file non è un criterio di ricerca: nella barra dei filtri non si mostra. -->
      @for (field of fields(); track field.name) {
        @if (field.type !== 'file' && runtime().isVisible(field, scope())) {
          <nz-form-item>
            @if (field.type !== 'checkbox') {
              <nz-form-label [nzFor]="id + field.name" [nzTooltipTitle]="field.tooltip ? runtime().text(field.tooltip, scope()) : undefined" [nzTooltipIcon]="'question-circle'">{{ runtime().text(field.label, scope()) || field.name }}</nz-form-label>
            }
            <nz-form-control>
              <lc-field-control
                [field]="field"
                [runtime]="runtime()"
                [scope]="scope()"
                [value]="value(field)"
                [inputId]="id + field.name"
                variant="filter"
                [placeholder]="i18n.t('lc.all')"
                commitOn="change"
                (valueChange)="change(field, $event)"
              />
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
  protected readonly id = nextId('lc-filter') + '-';
  /** In una barra in linea un testo su più righe si cerca con una casella su una riga. */
  protected readonly fields = computed(() => this.node().fields.map((f) => (f.type === 'textarea' || f.type === 'richtext' ? { ...f, type: 'text' as const } : f)));
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



  protected change(field: FieldDefinition, raw: unknown): void {
    let value: unknown = raw === '' || raw === undefined ? null : raw;
    if (field.type === 'number' && value !== null) value = Number(value);
    this.runtime().setState(this.path(field), value);
    // Un filtro nuovo riporta alla prima pagina.
    this.runtime().setState('page', 0);
  }
}
