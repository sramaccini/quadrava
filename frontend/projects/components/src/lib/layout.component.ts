import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import type { BorderNode, BorderRegion, BoxNode, GridNode, LayoutGap, NodeDefinition } from 'schema';

/**
 * Contenitori di layout: disegnano solo la disposizione dei figli (nessun bordo né sfondo, che restano alla sezione).
 * Le proprietà di posizione stanno sui figli (`grow` nel box, `span` nella griglia, `region` nel border). Lo spazio tra i
 * figli viene dal tema (`--lc-gap`). Un figlio nascosto non occupa spazio (`lc-node:empty`).
 */
const GAP_STYLES = `
  .gap-none { gap: 0; }
  .gap-small { gap: calc(var(--lc-gap, 12px) / 2); }
  .gap-medium { gap: var(--lc-gap, 12px); }
  .gap-large { gap: calc(var(--lc-gap, 12px) * 2); }
  lc-node:empty { display: none; }
  /* Nei contenitori i campi riempiono la cella. */
  lc-node { --lc-input-max: none; }
`;

function gapClass(gap: LayoutGap | undefined): string {
  return 'gap-' + (gap ?? 'medium');
}

const ALIGN: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const JUSTIFY: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };

/** Box: figli in riga (a capo quando manca spazio) o in colonna; `grow` divide lo spazio libero. */
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
    /* Chi prende spazio in una riga che va a capo non scende sotto i 200px. */
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

/** Griglia: `columns` colonne uguali, i figli ne occupano `span`; sotto i 600px una colonna sola. */
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
 * Border layout: nord e sud su tutta la larghezza, ovest ed est di larghezza fissa ai lati del centro, che prende il
 * resto. Le regioni vuote non occupano spazio. Sotto i 768px le regioni si impilano nell'ordine nord, ovest, centro,
 * est, sud.
 */
@Component({
  selector: 'lc-border',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; container-type: inline-size; }
    .border { display: grid; grid-template-columns: var(--lc-border-columns); grid-template-areas: var(--lc-border-areas); }
    .region { display: flex; flex-direction: column; min-width: 0; }
    .north { grid-area: north; } .south { grid-area: south; } .west { grid-area: west; } .east { grid-area: east; } .center { grid-area: center; }
    @container (max-width: 768px) {
      .border { grid-template-columns: minmax(0, 1fr); grid-template-areas: none; }
      .region { grid-area: auto; }
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

  /** I figli divisi per regione (center se non indicata), nell'ordine del documento. */
  protected readonly regions = computed(() => {
    const out: Record<BorderRegion, NodeDefinition[]> = { north: [], south: [], west: [], east: [], center: [] };
    for (const child of this.node().components) out[REGIONS.includes(child.region as BorderRegion) ? (child.region as BorderRegion) : 'center'].push(child);
    return out;
  });

  /** Le regioni con almeno un figlio, nell'ordine in cui si impilano su schermi stretti. */
  protected readonly present = computed(() => REGIONS.filter((r) => this.regions()[r].length > 0));

  /** Colonne e aree della griglia: solo per le regioni presenti, così una regione vuota non lascia spazio. */
  protected readonly template = computed(() => {
    const has = (r: BorderRegion) => this.regions()[r].length > 0;
    const middle = [has('west') ? 'west' : null, 'center', has('east') ? 'east' : null].filter((r): r is string => r !== null);
    const columns = [has('west') ? `${this.node().westWidth ?? 240}px` : null, 'minmax(0, 1fr)', has('east') ? `${this.node().eastWidth ?? 240}px` : null].filter(Boolean).join(' ');
    const row = (name: string) => `"${middle.map(() => name).join(' ')}"`;
    const areas = [has('north') ? row('north') : null, `"${middle.join(' ')}"`, has('south') ? row('south') : null].filter(Boolean).join(' ');
    return { columns, areas };
  });
}
