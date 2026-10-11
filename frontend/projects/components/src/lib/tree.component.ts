import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import type { NzTreeNodeOptions } from 'ng-zorro-antd/core/tree';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTreeModule } from 'ng-zorro-antd/tree';
import type { TreeNode } from 'schema';
import { nextId } from './shared';

type Row = Record<string, unknown>;

/** Pezzi di un testo: le parti che corrispondono alla ricerca (senza distinzione tra maiuscole e minuscole) sono marcate. */
export function highlight(text: string, search: string): { text: string; match: boolean }[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

/**
 * Vista ad albero sui dati di un data source (nodi radice con i figli annidati). Il titolo dei nodi è sempre testo:
 * il titolo predefinito di NG-ZORRO, durante la ricerca, lo inserirebbe come HTML. La scelta di un nodo scrive la sua
 * chiave nello stato (`bind`) ed esegue `onSelect` con il nodo in `row`.
 */
@Component({
  selector: 'lc-tree',
  imports: [FormsModule, NzAlertModule, NzInputModule, NzTreeModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .search { max-width: 320px; margin-bottom: 8px; }
    .title { padding: 0 2px; border-radius: 2px; }
    .title:focus-visible { outline: 2px solid var(--lc-color-primary, #1f5fbf); outline-offset: 1px; }
    mark { padding: 0; background: color-mix(in srgb, var(--lc-color-primary, #1f5fbf) 20%, transparent); color: inherit; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      @if (node().searchable) {
        <label class="visually-hidden" [for]="searchId">{{ i18n.t('lc.search') }}</label>
        <input nz-input class="search" type="search" [id]="searchId" [placeholder]="i18n.t('lc.search')" [ngModel]="search()" (ngModelChange)="search.set($event)" />
      }
      @if (nodes().length) {
        <nz-tree
          nzBlockNode
          [nzData]="nodes()"
          [nzSearchValue]="search()"
          [nzExpandedKeys]="expanded()"
          [nzSelectedKeys]="selected()"
          [nzTreeTemplate]="title"
          (nzExpandChange)="expanded.set($event.keys ?? [])"
          (nzClick)="choose($event.node?.key)"
        />
        <ng-template #title let-node>
          <span class="title" tabindex="0" (keydown.enter)="choose(node.key)" (keydown.space)="$event.preventDefault(); choose(node.key)">
            <!-- Parti su una sola riga: gli a capo diventerebbero spazi dentro le parole. -->
            @for (part of parts(node.title); track $index) {@if (part.match) {<mark>{{ part.text }}</mark>} @else {<span>{{ part.text }}</span>}}
          </span>
        </ng-template>
      } @else if (source().status === 'loading') {
        <p role="status">{{ i18n.t('lc.loading') }}</p>
      } @else {
        <p role="status">{{ i18n.t('lc.noData') }}</p>
      }
    }
  `,
})
export class TreeComponent {
  readonly node = input.required<TreeNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  protected readonly searchId = nextId('lc-tree-search');
  protected readonly search = signal('');
  private readonly local = signal<unknown>(null);
  private busy = false;

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  /** Righe originali per chiave (in testo, come le vuole il componente di NG-ZORRO). */
  private readonly rows = computed(() => {
    const map = new Map<string, Row>();
    const { keyField, childrenField } = this.fields();
    const visit = (items: unknown): void => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue;
        const row = item as Row;
        map.set(String(row[keyField]), row);
        visit(row[childrenField]);
      }
    };
    visit(this.data());
    return map;
  });
  private readonly fields = computed(() => ({
    keyField: this.node().keyField ?? 'id',
    labelField: this.node().labelField,
    childrenField: this.node().childrenField ?? 'children',
  }));
  private readonly data = computed(() => {
    const data = this.source().data;
    if (Array.isArray(data)) return data;
    const items = (data as { items?: unknown } | null)?.items;
    return Array.isArray(items) ? items : [];
  });

  protected readonly nodes = computed<NzTreeNodeOptions[]>(() => {
    const { keyField, labelField, childrenField } = this.fields();
    const convert = (items: unknown[]): NzTreeNodeOptions[] =>
      items
        .filter((item): item is Row => item !== null && typeof item === 'object')
        .map((row) => {
          const children = Array.isArray(row[childrenField]) ? convert(row[childrenField] as unknown[]) : [];
          const label = row[labelField];
          return { key: String(row[keyField]), title: label === null || label === undefined ? '' : String(label), children, isLeaf: children.length === 0 };
        });
    return convert(this.data());
  });

  /** Rami aperti: il primo livello (o tutti con expandAll) quando arrivano i dati; poi decide l'utente. */
  protected readonly expanded = linkedSignal<string[]>(() => {
    const all = this.node().expandAll;
    const keys: string[] = [];
    const visit = (nodes: NzTreeNodeOptions[], depth: number): void => {
      for (const n of nodes) {
        if (n.children?.length && (all || depth === 0)) keys.push(n.key);
        if (all) visit(n.children ?? [], depth + 1);
      }
    };
    visit(this.nodes(), 0);
    return keys;
  });

  private readonly current = computed(() => {
    const bind = this.node().bind;
    return bind ? this.runtime().getState(bind) : this.local();
  });
  protected readonly selected = computed(() => {
    const current = this.current();
    return current === null || current === undefined ? [] : [String(current)];
  });

  protected parts(title: unknown): { text: string; match: boolean }[] {
    return highlight(String(title ?? ''), this.search());
  }

  protected async choose(key: unknown): Promise<void> {
    if (key === null || key === undefined) return;
    const row = this.rows().get(String(key));
    if (!row) return;
    const value = row[this.fields().keyField];
    const bind = this.node().bind;
    if (bind) this.runtime().setState(bind, value);
    else this.local.set(value);
    const steps = this.node().onSelect;
    if (!steps || this.busy) return;
    this.busy = true;
    try {
      await runSteps(this.runtime(), steps, { ...this.scope(), row });
    } finally {
      this.busy = false;
    }
  }
}
