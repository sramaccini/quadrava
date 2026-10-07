import { ChangeDetectionStrategy, Component, input, OnInit } from '@angular/core';
import type { ScreenRuntime, Scope } from 'core';
import type { FieldDefinition, FilterBarNode } from 'schema';
import { CONTROL_STYLES, nextId } from './shared';

/** Barra dei filtri: scrive nello stato della schermata (`bind`), da cui i data source dipendono. */
@Component({
  selector: 'lc-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [CONTROL_STYLES, `.bar { display: flex; flex-wrap: wrap; gap: var(--lc-gap, 12px); align-items: flex-end; }`],
  template: `
    <form class="bar" role="search" (submit)="$event.preventDefault()">
      @for (field of node().fields; track field.name) {
        @if (runtime().isVisible(field, scope())) {
          <div class="lc-field">
            <label [for]="id + field.name">{{ field.label ?? field.name }}</label>
            @switch (field.type) {
              @case ('select') {
                <select class="lc-input" [id]="id + field.name" [value]="text(field)" (change)="change(field, $any($event.target).value)">
                  <option value="">Tutti</option>
                  @for (option of field.options ?? []; track option) {
                    <option [value]="option" [selected]="text(field) === option">{{ option }}</option>
                  }
                </select>
              }
              @case ('checkbox') {
                <input class="lc-input" type="checkbox" [id]="id + field.name" [checked]="runtime().getState(path(field)) === true" (change)="change(field, $any($event.target).checked || null)" />
              }
              @default {
                <input class="lc-input" [id]="id + field.name" [type]="field.type" [value]="text(field)" (change)="change(field, $any($event.target).value)" />
              }
            }
          </div>
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

  ngOnInit(): void {
    // Ogni filtro dichiarato esiste nello stato (nullo se non impostato): le espressioni `state.filtri.x` non vanno mai in errore.
    for (const field of this.node().fields) {
      if (this.runtime().getState(this.path(field)) === undefined) this.runtime().setState(this.path(field), null);
    }
  }

  protected path(field: FieldDefinition): string {
    return `${this.node().bind}.${field.name}`;
  }

  protected text(field: FieldDefinition): string {
    const value = this.runtime().getState(this.path(field));
    return value === null || value === undefined ? '' : String(value);
  }

  protected change(field: FieldDefinition, raw: unknown): void {
    let value: unknown = raw === '' ? null : raw;
    if (field.type === 'number' && value !== null) value = Number(value);
    this.runtime().setState(this.path(field), value);
    // Un filtro nuovo riporta alla prima pagina.
    this.runtime().setState('page', 0);
  }
}
