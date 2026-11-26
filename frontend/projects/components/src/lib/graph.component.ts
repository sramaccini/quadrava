import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import type { GraphNode, Tone } from 'schema';
import { BusyComponent } from './busy.component';
import { TONE_COLORS, TONE_TEXT } from './display.component';
import { GRAPH_NODE_HEIGHT, layoutGraph, readGraph, type GraphItem } from './graph-layout';
import { nextId } from './shared';

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
/** Width of a node box from its label (the drawing has no way to measure text before it is drawn). */
const boxWidth = (label: string): number => Math.min(220, Math.max(96, Math.round(label.length * 7.2) + 28));

/**
 * Nodes and edges read from a data source and laid out from left to right (`layoutGraph`), for example the statuses of a
 * workflow and its transitions. A node can be highlighted (the current status) and one marked as the start; edges from
 * any node start from a small «any» marker. Zoom and the labels of the edges are in a toolbar; screen readers get the
 * same graph as two lists, nodes and connections.
 */
@Component({
  selector: 'lc-graph',
  imports: [BusyComponent, NzAlertModule, NzButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    figure { margin: 0; }
    .tools { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
    .zoom { min-width: 3.5em; text-align: center; color: var(--lc-color-muted, #5d6b7a); font-variant-numeric: tabular-nums; }
    .canvas { overflow: auto; border: 1px solid var(--lc-color-border, #d9d9d9); border-radius: 6px; background: var(--lc-color-surface, #fff); }
    svg { display: block; color: var(--lc-color-muted, #5d6b7a); }
    .edge { fill: none; stroke: currentColor; stroke-width: 1.4; }
    .edge.back { stroke-dasharray: 5 3; }
    .edge-label { fill: var(--lc-color-on-surface, #1b2430); font-size: 11px; paint-order: stroke; stroke: var(--lc-color-surface, #fff); stroke-width: 4px; stroke-linejoin: round; }
    .any rect { fill: none; stroke: currentColor; stroke-dasharray: 3 2; }
    .any text { fill: var(--lc-color-muted, #5d6b7a); font-size: 11px; }
    .node text { font-size: 13px; }
    .node.current rect { stroke: var(--lc-color-on-surface, #1b2430); stroke-width: 3; }
    .node.current text { font-weight: 600; }
    .start { fill: var(--lc-color-on-surface, #1b2430); }
    figcaption { color: var(--lc-color-muted, #5d6b7a); font-size: 0.85em; margin-top: 6px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else if (!graph().nodes.length) {
      <lc-busy [busy]="source().status === 'loading'" [empty]="true">
        @if (source().status !== 'loading') { <p role="status">{{ i18n.t('lc.noData') }}</p> }
      </lc-busy>
    } @else {
      <lc-busy [busy]="source().status === 'loading'">
        <figure>
          <div class="tools" role="toolbar" [attr.aria-label]="i18n.t('lc.graphTools')">
            <button nz-button nzSize="small" type="button" [disabled]="zoomAt() === 0" [attr.aria-label]="i18n.t('lc.zoomOut')" (click)="zoomBy(-1)">−</button>
            <span class="zoom" aria-live="polite">{{ percent() }}%</span>
            <button nz-button nzSize="small" type="button" [disabled]="zoomAt() === zooms.length - 1" [attr.aria-label]="i18n.t('lc.zoomIn')" (click)="zoomBy(1)">+</button>
            <button nz-button nzSize="small" type="button" [disabled]="zoom() === 1" (click)="zoomAt.set(3)">{{ i18n.t('lc.zoomReset') }}</button>
            @if (hasEdgeLabels()) {
              <button nz-button nzSize="small" type="button" [attr.aria-pressed]="labels()" (click)="labels.set(!labels())">{{ i18n.t('lc.graphEdgeLabels') }}</button>
            }
          </div>
          <div class="canvas" [style.height.px]="height()">
            <svg [attr.width]="layout().width * zoom()" [attr.height]="layout().height * zoom()" [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height" aria-hidden="true" focusable="false">
              <defs>
                <marker [attr.id]="arrowId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              @for (edge of layout().edges; track edge.index) {
                <path class="edge" [class.back]="edge.kind === 'back'" [attr.d]="edge.path" [attr.marker-end]="'url(#' + arrowId + ')'" />
              }
              @for (any of layout().anys; track any.to) {
                <g class="any">
                  <rect [attr.x]="any.x" [attr.y]="any.y" [attr.width]="any.width" [attr.height]="any.height" rx="11" />
                  <text [attr.x]="any.x + any.width / 2" [attr.y]="any.y + any.height / 2 + 4" text-anchor="middle">{{ anyLabel() }}</text>
                </g>
              }
              @for (placed of layout().nodes; track placed.key) {
                <g class="node" [class.current]="placed.key === highlight()">
                  <rect [attr.x]="placed.x" [attr.y]="placed.y" [attr.width]="placed.width" [attr.height]="placed.height" rx="6" [attr.fill]="color(item(placed.key).tone)" />
                  <text [attr.x]="placed.x + placed.width / 2" [attr.y]="placed.y + nodeHeight / 2 + 4.5" text-anchor="middle" [attr.fill]="textColor(item(placed.key).tone)">{{ item(placed.key).label }}</text>
                </g>
                @if (placed.key === start()) {
                  <circle class="start" [attr.cx]="placed.x - 9" [attr.cy]="placed.y + nodeHeight / 2" r="5" />
                }
              }
              @if (labels()) {
                @for (edge of layout().edges; track edge.index) {
                  @if (edge.label) {
                    <text class="edge-label" [attr.x]="edge.labelX" [attr.y]="edge.labelY" [attr.text-anchor]="edge.kind === 'any' ? 'start' : 'middle'">{{ edge.label }}</text>
                  }
                }
              }
            </svg>
          </div>
          @if (caption()) { <figcaption>{{ caption() }}</figcaption> }
          <div class="visually-hidden">
            <p>{{ caption() || i18n.t('lc.chartData') }}</p>
            <p>{{ i18n.t('lc.graphNodes') }}</p>
            <ul>
              @for (node of graph().nodes; track node.key) {
                <li>{{ nodeText(node) }}</li>
              }
            </ul>
            <p>{{ i18n.t('lc.graphEdges') }}</p>
            <ul>
              @for (edge of graph().edges; track $index) {
                <li>{{ edgeText(edge.from, edge.to, edge.label) }}</li>
              }
            </ul>
          </div>
        </figure>
      </lc-busy>
    }
  `,
})
export class GraphComponent {
  readonly node = input.required<GraphNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  protected readonly zooms = ZOOMS;
  protected readonly nodeHeight = GRAPH_NODE_HEIGHT;
  protected readonly arrowId = nextId('lc-graph-arrow');
  protected readonly zoomAt = signal(3);
  protected readonly zoom = computed(() => ZOOMS[this.zoomAt()]);
  protected readonly percent = computed(() => Math.round(this.zoom() * 100));
  protected readonly labels = linkedSignal(() => this.node().edgeLabels !== false);
  protected readonly height = computed(() => this.node().height ?? 360);

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly graph = computed(() => readGraph(this.source().data, this.node(), (key, fallback) => this.i18n.t(key, {}, fallback)));
  private readonly items = computed(() => new Map(this.graph().nodes.map((n) => [n.key, n])));
  protected readonly anyLabel = computed(() => this.i18n.t('lc.graphAny'));
  protected readonly layout = computed(() =>
    layoutGraph(
      this.graph().nodes.map((n) => ({ key: n.key, width: boxWidth(n.label) })),
      this.graph().edges,
      { start: this.start(), anyWidth: Math.max(40, Math.round(this.anyLabel().length * 6.6) + 20) },
    ),
  );
  protected readonly hasEdgeLabels = computed(() => this.graph().edges.some((e) => e.label));
  protected readonly highlight = computed(() => this.resolved(this.node().highlight));
  protected readonly start = computed(() => this.resolved(this.node().start));
  protected readonly caption = computed(() => (this.node().caption ? this.runtime().text(this.node().caption!, this.scope()) : ''));

  protected item(key: string): GraphItem {
    return this.items().get(key)!;
  }

  protected color(tone: Tone): string {
    return TONE_COLORS[tone];
  }

  protected textColor(tone: Tone): string {
    return TONE_TEXT[tone];
  }

  protected zoomBy(step: number): void {
    this.zoomAt.set(Math.min(ZOOMS.length - 1, Math.max(0, this.zoomAt() + step)));
  }

  /** A node for screen readers, with «current» and «start». */
  protected nodeText(node: GraphItem): string {
    const marks = [node.key === this.highlight() ? this.i18n.t('lc.graphCurrent') : '', node.key === this.start() ? this.i18n.t('lc.graphStart') : ''].filter(Boolean);
    return marks.length ? `${node.label} (${marks.join(', ')})` : node.label;
  }

  protected edgeText(from: string | null, to: string, label?: string): string {
    const name = (key: string): string => this.items().get(key)?.label ?? key;
    const text = `${from === null ? this.anyLabel() : name(from)} → ${name(to)}`;
    return label ? `${text}: ${label}` : text;
  }

  /** A key from an expression; an empty or failed one is no key. */
  private resolved(template: string | undefined): string | null {
    if (template === undefined) return null;
    const value = this.runtime().text(template, this.scope());
    return value === '' || value.includes('{{') ? null : value;
  }
}
