import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { I18n, formatValue, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import type { ChartNode, ColumnDefinition, Tone } from 'schema';
import { niceScale, pieSlices } from './chart-geometry';
import { numeric } from './table-data';

type Row = Record<string, unknown>;

/** Tavolozza dei grafici: solo colori del tema e loro mescolanze. */
const PALETTE = [
  'var(--lc-color-primary, #1f5fbf)',
  'var(--lc-color-success, #2e7d32)',
  'var(--lc-color-danger, #c62828)',
  'color-mix(in srgb, var(--lc-color-primary, #1f5fbf) 45%, var(--lc-color-surface, #fff))',
  'color-mix(in srgb, var(--lc-color-success, #2e7d32) 45%, var(--lc-color-surface, #fff))',
  'var(--lc-color-muted, #5d6b7a)',
];
const TONE_VARS: Record<Tone, string> = {
  neutral: 'var(--lc-color-muted, #5d6b7a)',
  primary: PALETTE[0],
  success: PALETTE[1],
  danger: PALETTE[2],
};
const PAD = { left: 64, right: 12, top: 12, bottom: 30 };
type Side = 'left' | 'right';

interface Mark {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  tip: string;
}
interface Line {
  color: string;
  points: string;
  dots: { x: number; y: number; tip: string }[];
}

/**
 * Grafico a barre, a linee o a torta (ciambella) disegnato in SVG dalla piattaforma, con i colori del tema. Barre
 * affiancate o impilate, serie su un secondo asse a destra, grafici combinati (barre e linee insieme).
 * Ogni elemento mostra il valore al passaggio del mouse; la legenda è testo; per gli screen reader il disegno è
 * nascosto e i dati sono in una tabella equivalente.
 */
@Component({
  selector: 'lc-chart',
  imports: [NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; overflow: visible; }
    .grid { stroke: var(--lc-color-border, #d5dbe3); stroke-width: 1; }
    .axis { fill: var(--lc-color-muted, #5d6b7a); font-size: 11px; }
    .mark { transition: opacity 0.15s; }
    .mark:hover { opacity: 0.75; }
    .line { fill: none; stroke-width: 2.5; }
    .dot { stroke: var(--lc-color-surface, #fff); stroke-width: 2; }
    .total { fill: var(--lc-color-on-surface, #1b2430); font-size: 18px; font-weight: 600; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; list-style: none; margin: 8px 0 0; padding: 0; font-size: 0.9em; color: var(--lc-color-on-surface, #1b2430); }
    .legend li { display: inline-flex; align-items: center; gap: 6px; }
    .swatch { width: 10px; height: 10px; border-radius: 2px; flex: none; }
    .empty { margin: 0; color: var(--lc-color-muted, #5d6b7a); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else if (!rows().length) {
      <p class="empty" role="status">{{ source().status === 'loading' ? i18n.t('lc.loading') : i18n.t('lc.noData') }}</p>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" [attr.height]="height()" aria-hidden="true" focusable="false">
        @if (node().kind === 'pie') {
          @for (slice of slices(); track $index) {
            @if (slice.path) {
              <path class="mark" [attr.d]="slice.path" [attr.fill]="slice.color" fill-rule="evenodd"><title>{{ slice.tip }}</title></path>
            }
          }
          <text class="total" [attr.x]="width() / 2" [attr.y]="height() / 2 + 6" text-anchor="middle">{{ pieTotal() }}</text>
        } @else {
          @for (tick of axes().left.ticks; track $index) {
            <line class="grid" [attr.x1]="pad().left" [attr.x2]="width() - pad().right" [attr.y1]="y(tick)" [attr.y2]="y(tick)" />
            <text class="axis" [attr.x]="pad().left - 8" [attr.y]="y(tick) + 4" text-anchor="end">{{ short(tick, 'left') }}</text>
          }
          @if (axes().right; as right) {
            @for (tick of right.ticks; track $index) {
              <text class="axis right" [attr.x]="width() - pad().right + 8" [attr.y]="y(tick, 'right') + 4" text-anchor="start">{{ short(tick, 'right') }}</text>
            }
          }
          @for (label of categories(); track $index; let i = $index) {
            <text class="axis" [attr.x]="center(i)" [attr.y]="height() - 10" text-anchor="middle">{{ label }}</text>
          }
          @for (bar of bars(); track $index) {
            <rect class="mark" [attr.x]="bar.x" [attr.y]="bar.y" [attr.width]="bar.width" [attr.height]="bar.height" [attr.fill]="bar.color" rx="2"><title>{{ bar.tip }}</title></rect>
          }
          @for (line of lines(); track $index) {
            <polyline class="line" [attr.points]="line.points" [attr.stroke]="line.color" />
            @for (dot of line.dots; track $index) {
              <circle class="dot mark" [attr.cx]="dot.x" [attr.cy]="dot.y" r="4" [attr.fill]="line.color"><title>{{ dot.tip }}</title></circle>
            }
          }
        }
      </svg>
      <ul class="legend">
        @for (item of legend(); track $index) {
          <li><span class="swatch" [style.background]="item.color"></span>{{ item.label }}</li>
        }
      </ul>
      <table class="visually-hidden">
        @if (caption()) {
          <caption>{{ caption() }}</caption>
        }
        <thead>
          <tr>
            <th scope="col"></th>
            @for (label of seriesLabels(); track $index) {
              <th scope="col">{{ label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (label of categories(); track $index; let i = $index) {
            <tr>
              <th scope="row">{{ label }}</th>
              @for (s of node().series; track $index; let j = $index) {
                <td>{{ text(values()[j][i], s.axis ?? 'left') }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ChartComponent {
  readonly node = input.required<ChartNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  /** Larghezza reale del contenitore (testi nitidi); 600 finché non è misurata. */
  protected readonly width = signal(600);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver((entries) => {
        const w = Math.round(entries[0]?.contentRect.width ?? 0);
        if (w > 0) this.width.set(Math.max(240, w));
      });
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected readonly height = computed(() => this.node().height ?? 280);
  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly rows = computed<Row[]>(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data as Row[];
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? (items as Row[]) : [];
  });

  /** Etichette delle categorie, formattate o tradotte. */
  protected readonly categories = computed(() =>
    this.rows().map((row) => {
      const raw = row[this.node().categoryField];
      const value = raw === null || raw === undefined ? '' : String(raw);
      const format = this.node().categoryFormat;
      const locale = this.i18n.intlLocale();
      if (format === 'month' && /^\d{4}-\d{2}$/.test(value)) {
        return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1));
      }
      if (format === 'date') return formatValue(value, { format: 'date' }, locale).text;
      const key = this.node().categoryKey;
      return key ? this.i18n.t(`${key}.${value}`, {}, value) : value;
    }),
  );
  /** Valori per serie (righe in ordine); quelli non numerici valgono null. */
  protected readonly values = computed(() => this.node().series.map((s) => this.rows().map((row) => numeric(row[s.field]))));
  protected readonly seriesLabels = computed(() => this.node().series.map((s) => (s.label ? this.runtime().text(s.label, this.scope()) : s.field)));
  protected readonly caption = computed(() => (this.node().caption ? this.runtime().text(this.node().caption, this.scope()) : ''));

  private seriesColor(index: number): string {
    const tone = this.node().series[index].tone;
    return tone ? TONE_VARS[tone] : PALETTE[index % PALETTE.length];
  }

  private kindOf(index: number): 'bar' | 'line' {
    return this.node().series[index].kind ?? (this.node().kind === 'line' ? 'line' : 'bar');
  }
  private sideOf(index: number): Side {
    return this.node().series[index].axis ?? 'left';
  }
  protected readonly hasRight = computed(() => this.node().kind !== 'pie' && this.node().series.some((s) => s.axis === 'right'));
  protected readonly pad = computed(() => ({ ...PAD, right: this.hasRight() ? 64 : PAD.right }));

  /** Valori che una scala deve contenere: le somme impilate delle barre (positive e negative) e i valori delle linee. */
  private extent(side: Side): number[] {
    const values = this.values();
    const out: number[] = [];
    const bars = values.map((_, j) => j).filter((j) => this.kindOf(j) === 'bar' && this.sideOf(j) === side);
    if (this.node().stacked) {
      for (let i = 0; i < this.rows().length; i++) {
        let up = 0;
        let down = 0;
        for (const j of bars) {
          const v = values[j][i] ?? 0;
          if (v >= 0) up += v;
          else down += v;
        }
        out.push(up, down);
      }
    } else for (const j of bars) out.push(...values[j].filter((v): v is number => v !== null));
    values.forEach((series, j) => {
      if (this.kindOf(j) === 'line' && this.sideOf(j) === side) out.push(...series.filter((v): v is number => v !== null));
    });
    return out;
  }
  protected readonly axes = computed(() => ({ left: niceScale(this.extent('left')), right: this.hasRight() ? niceScale(this.extent('right')) : null }));

  protected y(value: number, side: Side = 'left'): number {
    const { min, max } = (side === 'right' ? this.axes().right : null) ?? this.axes().left;
    const top = PAD.top;
    const bottom = this.height() - PAD.bottom;
    return bottom - ((value - min) / (max - min)) * (bottom - top);
  }
  private band(): number {
    return (this.width() - this.pad().left - this.pad().right) / Math.max(1, this.rows().length);
  }
  protected center(index: number): number {
    return this.pad().left + this.band() * (index + 0.5);
  }

  /** Barre: affiancate (una colonna per serie) o impilate (una colonna per asse, con i pezzi delle serie uno sopra l'altro). */
  protected readonly bars = computed<Mark[]>(() => {
    const values = this.values();
    const bars = values.map((_, j) => j).filter((j) => this.kindOf(j) === 'bar');
    if (!bars.length) return [];
    const stacked = !!this.node().stacked;
    const groups = stacked ? [...new Set(bars.map((j) => this.sideOf(j)))].map((side) => bars.filter((j) => this.sideOf(j) === side)) : bars.map((j) => [j]);
    const band = this.band();
    const width = Math.max(2, (band * 0.7) / groups.length);
    const marks: Mark[] = [];
    groups.forEach((group, g) =>
      this.rows().forEach((_, i) => {
        const x = this.pad().left + band * i + band * 0.15 + width * g;
        let up = 0;
        let down = 0;
        for (const j of group) {
          const value = values[j][i];
          if (value === null) continue;
          const side = this.sideOf(j);
          const base = stacked ? (value >= 0 ? up : down) : 0;
          const end = base + value;
          if (stacked) {
            if (value >= 0) up = end;
            else down = end;
          }
          const y0 = this.y(base, side);
          const y1 = this.y(end, side);
          marks.push({ x, y: Math.min(y0, y1), width, height: Math.abs(y1 - y0), color: this.seriesColor(j), tip: this.tip(i, j, value) });
        }
      }),
    );
    return marks;
  });

  protected readonly lines = computed<Line[]>(() =>
    this.values().flatMap((series, j) => {
      if (this.kindOf(j) !== 'line') return [];
      const side = this.sideOf(j);
      const dots = series.flatMap((value, i) => (value === null ? [] : [{ x: this.center(i), y: this.y(value, side), tip: this.tip(i, j, value) }]));
      return [{ color: this.seriesColor(j), points: dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' '), dots }];
    }),
  );

  protected readonly slices = computed(() => {
    const values = (this.values()[0] ?? []).map((v) => v ?? 0);
    const radius = Math.min(this.width(), this.height()) / 2 - 8;
    return pieSlices(values, this.width() / 2, this.height() / 2, radius, radius * 0.58).map((slice, i) => ({
      ...slice,
      color: PALETTE[i % PALETTE.length],
      tip: `${this.categories()[i]}: ${this.text(values[i])} (${new Intl.NumberFormat(this.i18n.intlLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(slice.share)})`,
    }));
  });
  protected readonly pieTotal = computed(() => this.text((this.values()[0] ?? []).reduce<number>((a, b) => a + (b ?? 0), 0)));

  protected readonly legend = computed(() =>
    this.node().kind === 'pie'
      ? this.categories().map((label, i) => ({ label, color: PALETTE[i % PALETTE.length] }))
      : this.seriesLabels().map((label, j) => ({
          label: this.sideOf(j) === 'right' ? `${label} (${this.i18n.t('lc.rightAxis')})` : label,
          color: this.seriesColor(j),
        })),
  );

  private spec(side: Side = 'left'): ColumnDefinition {
    const node = this.node();
    const format = side === 'right' ? (node.rightFormat ?? node.format) : node.format;
    return { field: '', format: format ?? 'number', currency: node.currency, decimals: node.decimals };
  }
  protected text(value: number | null | undefined, side: Side = 'left'): string {
    return value === null || value === undefined ? '—' : formatValue(value, this.spec(side), this.i18n.intlLocale()).text;
  }
  /** Etichette dell'asse in forma breve (per esempio 12 Mln). */
  protected short(value: number, side: Side = 'left'): string {
    const node = this.node();
    const format = this.spec(side).format;
    const options: Intl.NumberFormatOptions =
      format === 'currency' ? { style: 'currency', currency: node.currency ?? 'EUR', notation: 'compact', maximumFractionDigits: 1 } : { notation: 'compact', maximumFractionDigits: 1 };
    const text = new Intl.NumberFormat(this.i18n.intlLocale(), options).format(value);
    return format === 'percent' ? `${text} %` : text;
  }
  private tip(category: number, series: number, value: number): string {
    const label = this.node().series.length > 1 ? `${this.categories()[category]} · ${this.seriesLabels()[series]}` : this.categories()[category];
    return `${label}: ${this.text(value, this.sideOf(series))}`;
  }
}
