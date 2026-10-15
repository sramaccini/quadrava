import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import type { BorderNode, BorderRegion, BoxNode, GridNode, LayoutGap, NodeDefinition } from 'schema';

/**
 * Layout containers: they draw only the arrangement of the children (no border or background, which stay with the section).
 * Position properties are on the children (`grow` in the box, `span` in the grid, `region` in the border). The space
 * between children comes from the theme (`--lc-gap`). A hidden child takes no space (`lc-node:empty`).
 */
const GAP_STYLES = `
  .gap-none { gap: 0; }
  .gap-small { gap: calc(var(--lc-gap, 12px) / 2); }
  .gap-medium { gap: var(--lc-gap, 12px); }
  .gap-large { gap: calc(var(--lc-gap, 12px) * 2); }
  lc-node:empty { display: none; }
  /* In containers the fields fill the cell. */
  lc-node { --lc-input-max: none; }
`;

function gapClass(gap: LayoutGap | undefined): string {
  return 'gap-' + (gap ?? 'medium');
}

const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };

/** Box: children in a row (wrapping when space runs out) or in a column; `grow` shares the free space. */
@Component({
  selector: 'lc-box',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .box { display: flex; }
    .box.column { flex-direction: column; }
    .box.wrap { flex-wrap: wrap; }
    .box > lc-node { flex: 0 1 auto; min-width: 0; }
    /* Whoever takes space in a wrapping row does not go below 200px. */
    .box.wrap:not(.column) > lc-node.grow { min-width: 200px; }
    ${GAP_STYLES}
  `,
  template: `
    <div class="box" [class]="gapClass()" [class.column]="node().direction === 'column'" [class.wrap]="wrap()" [style.align-items]="align()" [style.justify-content]="justify()">
      @for (child of node().components; track $index) {
        <lc-node [class.grow]="!!child.grow" [style.flex]="child.grow ? child.grow + ' 1 0' : null" [node]="child" [runtime]="runtime()" [scope]="scope()" />
      }
    </div>
  `,
})
export class BoxComponent {
  readonly node = input.required<BoxNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly gapClass = computed(() => gapClass(this.node().gap));
  protected readonly wrap = computed(() => this.node().direction !== 'column' && this.node().wrap !== false);
  protected readonly align = computed(() => ALIGN[this.node().align ?? 'stretch']);
  protected readonly justify = computed(() => JUSTIFY[this.node().justify ?? 'start']);
}

/** Grid: `columns` equal columns, children take `span` of them; below 600px a single column. */
@Component({
  selector: 'lc-grid',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; container-type: inline-size; }
    .grid { display: grid; grid-template-columns: repeat(var(--lc-grid-columns), minmax(0, 1fr)); }
    .grid > lc-node { grid-column: span var(--lc-span, 1); min-width: 0; }
    @container (max-width: 600px) {
      .grid { grid-template-columns: minmax(0, 1fr); }
      .grid > lc-node { grid-column: auto; }
    }
    ${GAP_STYLES}
  `,
  template: `
    <div class="grid" [class]="gapClass()" [style.--lc-grid-columns]="columns()">
      @for (child of node().components; track $index) {
        <lc-node [style.--lc-span]="span(child)" [node]="child" [runtime]="runtime()" [scope]="scope()" />
      }
    </div>
  `,
})
export class GridComponent {
  readonly node = input.required<GridNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly gapClass = computed(() => gapClass(this.node().gap));
  protected readonly columns = computed(() => Math.min(12, Math.max(1, this.node().columns ?? 2)));

  protected span(child: NodeDefinition): number {
    return Math.min(this.columns(), Math.max(1, child.span ?? 1));
  }
}

const REGIONS: BorderRegion[] = ['north', 'west', 'center', 'east', 'south'];

/**
 * Border layout: north and south across the whole width, west and east of fixed width at the sides of the center, which
 * takes the rest. Empty regions take no space. Below 768px the regions stack in the order north, west, center,
 * east, south.
 */
@Component({
  selector: 'lc-border',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; container-type: inline-size; }
    .border { display: grid; grid-template-columns: var(--lc-border-columns); grid-template-areas: var(--lc-border-areas); }
    .region { display: flex; flex-direction: column; min-width: 0; position: relative; }
    /* Dividers of the resizable sides: a thin strip on the edge towards the center. */
    .handle { position: absolute; top: 0; bottom: 0; width: 10px; cursor: col-resize; touch-action: none; z-index: 1; }
    .west > .handle { right: -11px; }
    .east > .handle { left: -11px; }
    .handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 4px; width: 2px; border-radius: 1px; background: transparent; }
    .handle:hover::after, .handle:focus-visible::after, .handle.dragging::after { background: var(--lc-color-primary, #1f5fbf); }
    .handle:focus-visible { outline: none; }
    .north { grid-area: north; } .south { grid-area: south; } .west { grid-area: west; } .east { grid-area: east; } .center { grid-area: center; }
    @container (max-width: 768px) {
      .border { grid-template-columns: minmax(0, 1fr); grid-template-areas: none; }
      .region { grid-area: auto; }
      .handle { display: none; }
    }
    ${GAP_STYLES}
  `,
  template: `
    <div class="border" [class]="gapClass()" [style.--lc-border-columns]="template().columns" [style.--lc-border-areas]="template().areas">
      @for (region of present(); track region) {
        <div class="region" [class]="region + ' ' + gapClass()" [attr.data-region]="region">
          @for (child of regions()[region]; track $index) {
            <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
          }
          @if (node().resizable && (region === 'west' || region === 'east')) {
            <div
              class="handle"
              role="separator"
              tabindex="0"
              aria-orientation="vertical"
              [attr.aria-label]="i18n.t(region === 'west' ? 'lc.resizeWest' : 'lc.resizeEast')"
              [attr.aria-valuenow]="width(region)"
              [attr.aria-valuemin]="MIN"
              [attr.aria-valuemax]="MAX"
              [class.dragging]="dragging() === region"
              (pointerdown)="startDrag($event, region)"
              (pointermove)="drag($event)"
              (pointerup)="endDrag($event)"
              (pointercancel)="endDrag($event)"
              (keydown)="key($event, region)"
            ></div>
          }
        </div>
      }
    </div>
  `,
})
export class BorderComponent {
  readonly node = input.required<BorderNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly gapClass = computed(() => gapClass(this.node().gap));
  protected readonly i18n = inject(I18n);
  protected readonly MIN = 120;
  protected readonly MAX = 600;
  /** Widths chosen by the user by dragging the dividers (only for this visit of the screen). */
  private readonly resized = signal<{ west?: number; east?: number }>({});
  protected readonly dragging = signal<'west' | 'east' | null>(null);
  private dragStart: { x: number; width: number } | null = null;

  protected width(side: 'west' | 'east'): number {
    return this.resized()[side] ?? (side === 'west' ? this.node().westWidth : this.node().eastWidth) ?? 240;
  }

  private setWidth(side: 'west' | 'east', width: number): void {
    const clamped = Math.round(Math.min(this.MAX, Math.max(this.MIN, width)));
    this.resized.update((r) => ({ ...r, [side]: clamped }));
  }

  protected startDrag(event: PointerEvent, side: 'west' | 'east'): void {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragging.set(side);
    this.dragStart = { x: event.clientX, width: this.width(side) };
  }

  protected drag(event: PointerEvent): void {
    const side = this.dragging();
    if (!side || !this.dragStart) return;
    const dx = event.clientX - this.dragStart.x;
    // Towards the right the west side widens, the east one narrows.
    this.setWidth(side, this.dragStart.width + (side === 'west' ? dx : -dx));
  }

  protected endDrag(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.dragging.set(null);
    this.dragStart = null;
  }

  /** From the keyboard: arrows of 16px (64px with Shift), Home and End to the limits. */
  protected key(event: KeyboardEvent, side: 'west' | 'east'): void {
    const step = event.shiftKey ? 64 : 16;
    const grow = side === 'west' ? 1 : -1;
    const current = this.width(side);
    const next =
      event.key === 'ArrowRight' ? current + step * grow : event.key === 'ArrowLeft' ? current - step * grow : event.key === 'Home' ? this.MIN : event.key === 'End' ? this.MAX : null;
    if (next === null) return;
    event.preventDefault();
    this.setWidth(side, next);
  }

  /** The children split by region (center if not given), in document order. */
  protected readonly regions = computed(() => {
    const out: Record<BorderRegion, NodeDefinition[]> = { north: [], south: [], west: [], east: [], center: [] };
    for (const child of this.node().components) out[REGIONS.includes(child.region as BorderRegion) ? (child.region as BorderRegion) : 'center'].push(child);
    return out;
  });

  /** The regions with at least one child, in the order in which they stack on narrow screens. */
  protected readonly present = computed(() => REGIONS.filter((r) => this.regions()[r].length > 0));

  /** Columns and areas of the grid: only for the regions present, so an empty region leaves no space. */
  protected readonly template = computed(() => {
    const has = (r: BorderRegion) => this.regions()[r].length > 0;
    const middle = [has('west') ? 'west' : null, 'center', has('east') ? 'east' : null].filter((r): r is string => r !== null);
    const columns = [has('west') ? `${this.width('west')}px` : null, 'minmax(0, 1fr)', has('east') ? `${this.width('east')}px` : null].filter(Boolean).join(' ');
    const row = (name: string) => `"${middle.map(() => name).join(' ')}"`;
    const areas = [has('north') ? row('north') : null, `"${middle.join(' ')}"`, has('south') ? row('south') : null].filter(Boolean).join(' ');
    return { columns, areas };
  });
}
