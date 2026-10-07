import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import type { TabDefinition, TabsNode } from 'schema';
import { CONTROL_STYLES, nextId } from './shared';

/**
 * Schede. Si vede una scheda alla volta ma tutte restano nella pagina (nascoste): i dati inseriti in un form
 * non si perdono cambiando scheda. Una scheda con `visibleIf` falso non compare. Tastiera: frecce, Home, Fine.
 */
@Component({
  selector: 'lc-tabs',
  imports: [NodeHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    CONTROL_STYLES,
    `
      [role='tablist'] { display: flex; gap: 2px; border-bottom: 1px solid var(--lc-color-border, #d5dbe3); overflow-x: auto; }
      [role='tab'] {
        height: var(--lc-control-height, 38px); padding: 0 calc(var(--lc-gap, 12px) * 1.2); border: 0; border-bottom: 3px solid transparent;
        background: transparent; color: var(--lc-color-muted, #5d6b7a); font: inherit; cursor: pointer; white-space: nowrap;
      }
      [role='tab'][aria-selected='true'] { color: var(--lc-color-primary, #1f5fbf); border-bottom-color: var(--lc-color-primary, #1f5fbf); font-weight: 600; }
      [role='tab']:focus-visible { outline: 2px solid var(--lc-color-primary, #1f5fbf); outline-offset: -2px; }
      [role='tabpanel'] { padding-top: var(--lc-gap, 12px); }
      [role='tabpanel'][hidden] { display: none; }
      .body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
    `,
  ],
  template: `
    <div role="tablist">
      @for (tab of visibleTabs(); track tab; let i = $index) {
        <button
          type="button"
          role="tab"
          [id]="id + 't' + i"
          [attr.aria-selected]="i === active()"
          [attr.aria-controls]="id + 'p' + i"
          [attr.tabindex]="i === active() ? 0 : -1"
          (click)="select(tab)"
          (keydown)="key($event, i)"
        >
          {{ runtime().text(tab.label, scope()) }}
        </button>
      }
    </div>
    @for (tab of visibleTabs(); track tab; let i = $index) {
      <div role="tabpanel" [id]="id + 'p' + i" [attr.aria-labelledby]="id + 't' + i" [hidden]="i !== active()">
        <div class="body">
          @for (child of tab.components; track $index) {
            <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
          }
        </div>
      </div>
    }
  `,
})
export class TabsComponent {
  readonly node = input.required<TabsNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly id = nextId('lc-tabs') + '-';
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly selected = signal<TabDefinition | null>(null);

  protected readonly visibleTabs = computed(() => this.node().tabs.filter((t) => this.runtime().isVisible(t, this.scope())));
  /** Indice della scheda mostrata: quella scelta, se è ancora visibile, altrimenti la prima. */
  protected readonly active = computed(() => Math.max(0, this.visibleTabs().indexOf(this.selected() as TabDefinition)));

  protected select(tab: TabDefinition): void {
    this.selected.set(tab);
  }

  protected key(event: KeyboardEvent, index: number): void {
    const last = this.visibleTabs().length - 1;
    const target = { ArrowRight: index >= last ? 0 : index + 1, ArrowLeft: index <= 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    this.select(this.visibleTabs()[target]);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[id="${this.id}t${target}"]`)?.focus());
  }
}
