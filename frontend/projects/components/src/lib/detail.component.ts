import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LOWCODE_LOCALE, formatValue, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import type { ColumnDefinition, DetailNode } from 'schema';
import { TONE_STYLES } from './shared';

/**
 * Scheda di dettaglio in sola lettura: un record mostrato come coppie etichetta e valore.
 * Il data source `source` deve restituire un oggetto; ogni campo usa gli stessi formati delle colonne di una tabella.
 */
@Component({
  selector: 'lc-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    TONE_STYLES,
    `
      .box { border: 1px solid var(--lc-color-border, #d5dbe3); border-radius: var(--lc-radius, 6px); background: var(--lc-color-surface, #fff); padding: var(--lc-gap, 12px); }
      h2 { margin: 0 0 var(--lc-gap, 12px); font-size: 1.15em; }
      dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--lc-gap, 12px); }
      dt { font-size: .85em; color: var(--lc-color-muted, #5d6b7a); }
      dd { margin: 2px 0 0; min-height: 1.4em; overflow-wrap: anywhere; }
      .state { margin: 0; color: var(--lc-color-muted, #5d6b7a); }
      .state.error { color: var(--lc-color-danger, #c62828); }
    `,
  ],
  template: `
    <section class="box" [attr.aria-label]="node().title" [attr.aria-busy]="source().status === 'loading'">
      @if (node().title) {
        <h2>{{ runtime().text(node().title, scope()) }}</h2>
      }
      @if (source().status === 'error') {
        <p class="state error" role="alert">{{ source().error }}</p>
      } @else if (record(); as rec) {
        <dl>
          @for (field of fields(); track field.field) {
            <div>
              <dt>{{ field.label ?? field.field }}</dt>
              <dd>
                @if (view(rec, field); as v) {
                  @if (v.tone) {
                    <span [class]="'tone tone-' + v.tone">{{ v.text }}</span>
                  } @else {
                    {{ v.text || '—' }}
                  }
                }
              </dd>
            </div>
          }
        </dl>
      } @else if (source().status === 'ready') {
        <p class="state" role="status">Nessun dato.</p>
      } @else {
        <p class="state" role="status">Caricamento…</p>
      }
    </section>
  `,
})
export class DetailComponent {
  readonly node = input.required<DetailNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  private readonly locale = inject(LOWCODE_LOCALE);
  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly fields = computed(() => this.node().fields.filter((f) => this.runtime().isVisible(f, this.scope())));
  protected readonly record = computed<Record<string, unknown> | null>(() => {
    const data = this.source().data;
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  });

  protected view(record: Record<string, unknown>, field: ColumnDefinition): FormattedValue {
    return formatValue(record[field.field], field, this.locale);
  }
}
