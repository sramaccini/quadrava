import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, formatValue, type FormatLabels, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { StatItem, StatsNode, Tone } from 'schema';
import { IconComponent } from './icon.component';

/** Colore del valore per ogni tono: sempre dal tema. */
const TONE_VARS: Record<Tone, string> = {
  neutral: 'var(--lc-color-on-surface, #1b2430)',
  primary: 'var(--lc-color-primary, #1f5fbf)',
  success: 'var(--lc-color-success, #2e7d32)',
  danger: 'var(--lc-color-danger, #c62828)',
};

interface StatView {
  item: StatItem;
  label: string;
  text: string;
  caption: string;
  tooltip: string | null;
  color: string;
}

/**
 * Indicatori (KPI): una fila di riquadri con etichetta e valore grande, che va a capo sugli schermi stretti.
 * Il valore viene da un campo del record restituito da `source` oppure da un'espressione (`value`), che vede
 * il record come `row`; si usano gli stessi formati delle colonne.
 */
@Component({
  selector: 'lc-stats',
  imports: [IconComponent, NzAlertModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--lc-gap, 12px); }
    .stat { display: flex; flex-direction: column; gap: 4px; padding: 16px 20px; border-radius: var(--lc-radius, 6px);
      background: var(--lc-color-surface, #fff); border: 1px solid var(--lc-color-border, #d5dbe3); min-width: 0; }
    dt { margin: 0; color: var(--lc-color-muted, #5d6b7a); font-size: 0.9em; display: flex; align-items: center; gap: 4px; }
    dd { margin: 0; }
    .value { display: block; font-size: 26px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
    .caption { display: block; color: var(--lc-color-muted, #5d6b7a); font-size: 0.85em; margin-top: 2px; }
    .help { display: inline-flex; cursor: help; }
    .help:focus-visible { outline: 2px solid var(--lc-color-primary, #1f5fbf); outline-offset: 2px; border-radius: 50%; }
  `,
  template: `
    @if (status() === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="error()" nzShowIcon /></div>
    } @else {
      <dl [attr.aria-busy]="status() === 'loading'">
        @for (stat of stats(); track $index) {
          <div class="stat">
            <dt>
              {{ stat.label }}
              @if (stat.tooltip; as tip) {
                <span class="help" tabindex="0" role="img" [attr.aria-label]="tip" nz-tooltip [nzTooltipTitle]="tip"><lc-icon name="help" /></span>
              }
            </dt>
            <dd>
              <span class="value" [style.color]="stat.color">{{ stat.text }}</span>
              @if (stat.caption) {
                <span class="caption">{{ stat.caption }}</span>
              }
            </dd>
          </div>
        }
      </dl>
    }
  `,
})
export class StatsComponent {
  readonly node = input.required<StatsNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  private readonly labels = (): FormatLabels => ({ yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key, fallback) => this.i18n.t(key, {}, fallback) });

  private readonly source = computed(() => {
    const name = this.node().source;
    return name ? this.runtime().source(name) : null;
  });
  protected readonly status = computed(() => this.source()?.status ?? 'ready');
  protected readonly error = computed(() => this.source()?.error ?? null);
  private readonly record = computed<Record<string, unknown>>(() => {
    const data = this.source()?.data;
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  });

  protected readonly stats = computed<StatView[]>(() => {
    const row = this.record();
    const scope: Scope = { ...this.scope(), row };
    const runtime = this.runtime();
    // Finché il data source non ha risposto non si valutano valori e note: su un record vuoto darebbero solo errori.
    const waiting = !!this.node().source && this.source()?.data == null;
    return this.node()
      .items.filter((item) => runtime.isVisible(item, scope))
      .map((item) => {
        const raw = waiting ? undefined : item.value !== undefined ? runtime.resolveValue(item.value, scope) : item.field ? row[item.field] : undefined;
        const text = waiting ? '…' : formatValue(raw, item, this.i18n.intlLocale(), this.labels()).text || '—';
        return {
          item,
          label: runtime.text(item.label, scope),
          text,
          caption: item.caption && !waiting ? runtime.text(item.caption, scope) : '',
          tooltip: item.tooltip ? runtime.text(item.tooltip, scope) || null : null,
          color: TONE_VARS[item.tone ?? 'neutral'],
        };
      });
  });
}
