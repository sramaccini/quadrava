import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, input, signal } from '@angular/core';
import { I18n, formatValue, type ScreenRuntime, type Scope } from 'core';
import type { SquareChartNode } from 'schema';
import { BusyComponent } from './busy.component';
import { numeric } from './table-data';
import { inject } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';

type Row = Record<string, unknown>;
interface Cell { x: number; y: number; label: string; value: number; tip: string; }

/** Dense square columns for time series and activity counts, with a text table for assistive technology. */
@Component({
  selector: 'lc-square-chart',
  imports: [BusyComponent, NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    figure { margin: 0; }
    svg { display: block; width: 100%; }
    .axis { fill: var(--lc-color-muted, #5d6b7a); font-size: 11px; }
    .cell { fill: var(--lc-color-primary, #1f5fbf); }
    .empty-cell { fill: color-mix(in srgb, var(--lc-color-muted, #5d6b7a) 18%, var(--lc-color-surface, #fff)); }
    figcaption { color: var(--lc-color-muted, #5d6b7a); font-size: 0.85em; margin-top: 6px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else if (!rows().length) {
      <lc-busy [busy]="source().status === 'loading'" [empty]="true">
        @if (source().status !== 'loading') { <p role="status">{{ i18n.t('lc.noData') }}</p> }
      </lc-busy>
    } @else {
      <lc-busy [busy]="source().status === 'loading'">
        <figure>
          <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" [attr.height]="height()" aria-hidden="true" focusable="false">
            @for (tick of ticks(); track $index) {
              <text class="axis" x="2" [attr.y]="tick.y + 9">{{ tick.label }}</text>
            }
            @for (cell of cells(); track $index) {
              <rect [class.cell]="cell.value > 0" [class.empty-cell]="cell.value <= 0" [attr.x]="cell.x" [attr.y]="cell.y" [attr.width]="square" [attr.height]="square" rx="1"><title>{{ cell.tip }}</title></rect>
            }
            @for (label of labels(); track $index) {
              <text class="axis" [attr.x]="label.x" [attr.y]="height() - 3" text-anchor="middle">{{ label.text }}</text>
            }
          </svg>
          @if (caption()) { <figcaption>{{ caption() }}</figcaption> }
          <table class="visually-hidden">
            <caption>{{ caption() || i18n.t('lc.chartData') }}</caption>
            <thead><tr><th scope="col">{{ categoryLabel() }}</th><th scope="col">{{ valueLabel() }}</th></tr></thead>
            <tbody>@for (row of rows(); track $index) { <tr><th scope="row">{{ category($index) }}</th><td>{{ valueText($index) }}</td></tr> }</tbody>
          </table>
        </figure>
      </lc-busy>
    }
  `,
})
export class SquareChartComponent {
  readonly node = input.required<SquareChartNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  protected readonly square = 6;
  protected readonly width = signal(600);
  protected readonly height = computed(() => this.node().height ?? 220);
  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly rows = computed<Row[]>(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data as Row[];
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? items as Row[] : [];
  });
  private readonly values = computed(() => this.rows().map((row) => numeric(row[this.node().valueField]) ?? 0));
  private readonly maxValue = computed(() => Math.max(1, ...this.values()));
  private readonly plotTop = 12;
  private readonly plotBottom = computed(() => this.height() - 24);
  private readonly rowStep = computed(() => (this.plotBottom() - this.plotTop) / 12);
  protected readonly ticks = computed(() => [0, 0.5, 1].map((fraction) => {
    const value = this.maxValue() * fraction;
    const y = this.plotBottom() - fraction * (this.plotBottom() - this.plotTop);
    return { y, label: new Intl.NumberFormat(this.i18n.intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value) };
  }));
  protected readonly cells = computed<Cell[]>(() => this.rows().flatMap((_, index) => {
    const value = this.values()[index];
    const count = Math.round(value / this.maxValue() * 12);
    return Array.from({ length: 12 }, (_, level) => ({
      x: 40 + index * this.band() + (this.band() - this.square) / 2,
      y: this.plotBottom() - (level + 1) * this.rowStep(),
      label: this.category(index), value: level < count ? value : 0,
      tip: `${this.category(index)}: ${this.valueText(index)}`,
    }));
  }));
  protected readonly labels = computed(() => this.rows().flatMap((_, index) => {
    const stride = Math.max(1, Math.ceil(this.rows().length / 6));
    return index % stride === 0 || index === this.rows().length - 1 ? [{ x: 40 + index * this.band() + this.band() / 2, text: this.category(index) }] : [];
  }));
  protected category(index: number): string {
    const raw = this.rows()[index]?.[this.node().categoryField];
    const value = raw == null ? '' : String(raw);
    const format = this.node().categoryFormat;
    if (format === 'month' && /^\d{4}-\d{2}$/.test(value)) return new Intl.DateTimeFormat(this.i18n.intlLocale(), { month: 'short', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
    if (format === 'date') return formatValue(value, { format: 'date' }, this.i18n.intlLocale()).text;
    return value;
  }
  protected valueText(index: number): string { return formatValue(this.values()[index], { format: this.node().format ?? 'number', currency: this.node().currency, decimals: this.node().decimals }, this.i18n.intlLocale()).text; }
  protected readonly caption = computed(() => this.node().caption ? this.runtime().text(this.node().caption!, this.scope()) : '');
  protected readonly categoryLabel = computed(() => this.node().categoryField);
  protected readonly valueLabel = computed(() => this.node().valueField);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver((entries) => {
        const measured = Math.round(entries[0]?.contentRect.width ?? 0);
        if (measured > 0) this.width.set(Math.max(280, measured));
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private band(): number { return (this.width() - 48) / Math.max(1, this.rows().length); }
}
