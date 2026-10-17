import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterEveryRender, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { QuadravaWordmarkComponent, SidebarComponent, type NavigateEvent } from 'components';
import { I18n, NavigationRuntime, Notifier, ScreenComponent, ThemeService, loadMessages } from 'core';
import { validateTheme, type ThemeDefinition } from 'schema';
import { PreviewChannel, PreviewSession } from './preview-ports';
import { NODE_DRAG_TYPE, PALETTE_DRAG_TYPE, type DropZone, type ResizeProperty } from './protocol';
import { resizeValue } from './resize';

/** Components containing others: a drop in the centre puts it inside. */
const CONTAINERS = new Set(['section', 'box', 'grid', 'border', 'tabs', 'wizard']);

const LANGUAGES = ['en', 'it'];

/** Equality by content: every message arrives cloned, hence with new objects even when nothing changed. */
const sameJson = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Root of the preview, inside the iframe: draws with the real runtime the state the editor sends (screen, menu,
 * theme, profile, sample data, translations). Being a page of its own, theme and styles (including the dark sheet of
 * NG-ZORRO) apply only here.
 *
 * Link with the editor: the selected node is highlighted by a frame (and its tab, if hidden, is
 * opened); Alt+click on a component, or a click in selection mode, selects it instead of activating it. In selection
 * mode components are dragged to move them, and the selected one inside a grid or a box has a handle
 * to change its width (`span` or `grow`). The editor makes the changes: the preview only sends messages.
 */
@Component({
  selector: 'lc-root',
  imports: [QuadravaWordmarkComponent, ScreenComponent, SidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; min-height: 100vh; background: var(--lc-color-background); color: var(--lc-color-on-surface); }
    .frame { position: relative; flex: 1; min-width: 0; }
    .frame.selecting ::ng-deep lc-node[data-node-id] { cursor: crosshair; }
    .highlight { position: absolute; pointer-events: none; border: 2px dashed var(--lc-color-primary); border-radius: var(--lc-radius); z-index: 10; }
    /* Where the component dragged from the palette would go: a line before or after, a full frame inside. */
    .drop { position: absolute; pointer-events: none; z-index: 11; background: var(--lc-color-primary); border-radius: 2px; }
    .drop.inside { background: color-mix(in srgb, var(--lc-color-primary) 12%, transparent); outline: 2px solid var(--lc-color-primary); }
    .empty { padding: 24px; color: var(--lc-color-muted); }
    .frame.selecting ::ng-deep lc-node[draggable='true'] { cursor: grab; }
    .resize { position: absolute; z-index: 12; width: 8px; height: 28px; border-radius: 4px; cursor: ew-resize; touch-action: none;
      background: var(--lc-color-primary); box-shadow: 0 0 0 2px var(--lc-color-surface); }
    lc-sidebar { min-height: 100vh; }
  `,
  template: `
    @if (navigation(); as nav) {
      <lc-sidebar [navigation]="nav" brand="Quadrava" [tone]="tone()" [areaId]="areaId()" (areaChange)="areaId.set($event)" (navigate)="navigated($event)">
        <lc-quadrava-wordmark lcBrand icon="brand/quadrava-icon-small.svg" [tone]="tone()" />
      </lc-sidebar>
    }
    @if (state(); as s) {
      @if (screen() || !navigation()) {
        <main #frame class="frame" [class.selecting]="s.selectMode" (dragstart)="dragStart($event)" (dragover)="dragOver($event)" (dragleave)="dragLeave($event)" (drop)="drop($event)">
          @if (screen(); as definition) {
            @for (v of [version()]; track v) {
              <lc-screen [definition]="definition" [params]="params()" />
            }
          } @else {
            <p class="empty">{{ i18n.t('ed.preview.empty') }}</p>
          }
          @if (dropAt(); as d) {
            <div
              class="drop"
              [class.inside]="d.zone === 'inside'"
              aria-hidden="true"
              [style.top.px]="d.zone === 'after' ? d.box.top + d.box.height + 2 : d.zone === 'before' ? d.box.top - 5 : d.box.top"
              [style.left.px]="d.box.left"
              [style.width.px]="d.box.width"
              [style.height.px]="d.zone === 'inside' ? d.box.height : 3"
            ></div>
          }
          @if (highlight(); as box) {
            <div class="highlight" aria-hidden="true" [style.top.px]="box.top - 3" [style.left.px]="box.left - 3" [style.width.px]="(resizing()?.width ?? box.width) + 6" [style.height.px]="box.height + 6"></div>
            @if (s.selectMode && resizable()) {
              <div
                class="resize"
                aria-hidden="true"
                [attr.title]="i18n.t(resizable() === 'span' ? 'ed.preview.resizeSpan' : 'ed.preview.resizeGrow')"
                [style.top.px]="box.top + box.height / 2 - 14"
                [style.left.px]="box.left + (resizing()?.width ?? box.width) - 1"
                (pointerdown)="startResize($event)"
                (pointermove)="moveResize($event)"
                (pointerup)="endResize($event)"
                (pointercancel)="resizing.set(null)"
              ></div>
            }
          }
        </main>
      }
    }
  `,
})
export class PreviewApp {
  private readonly channel = inject(PreviewChannel);
  private readonly session = inject(PreviewSession);
  private readonly themes = inject(ThemeService);
  private readonly notifier = inject(Notifier);
  protected readonly i18n = inject(I18n);

  protected readonly state = this.channel.state;
  // The parts of the state keep the same reference until the content changes: otherwise a message that
  // changes only the selection would recreate the screen (tabs back to the first, forms emptied).
  protected readonly screen = computed(() => this.state()?.screen ?? null, { equal: sameJson });
  protected readonly params = computed(() => this.state()?.params ?? {}, { equal: sameJson });
  private readonly navigationDefinition = computed(() => this.state()?.navigation ?? null, { equal: sameJson });
  private readonly theme = computed(() => this.state()?.theme ?? null, { equal: sameJson });
  protected readonly version = computed(() => this.state()?.version ?? 0);
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  protected readonly highlight = signal<Box | null>(null);
  /** Default theme (the light one of the demo), used when the editor does not send one. */
  private readonly fallbackTheme = signal<ThemeDefinition | null>(null);

  /** The menu: recreated only when the navigation changes; it reads the permissions from the profile, which follows the state. */
  protected readonly navigation = computed(() => {
    const definition = this.navigationDefinition();
    return definition ? new NavigationRuntime(definition, { authorization: this.session, userProvider: this.session, i18n: this.i18n }) : null;
  });
  protected readonly areaId = linkedSignal<NavigationRuntime | null, string | null>({
    source: () => this.navigation(),
    computation: (nav, previous) => {
      const visible = nav?.areas() ?? [];
      return previous?.value && visible.some((u) => u.id === previous.value) ? previous.value : (visible[0]?.id ?? null);
    },
  });
  protected readonly tone = computed(() => {
    const theme = this.theme() ?? this.fallbackTheme();
    return theme?.tokens.layout?.sider?.tone ?? (theme?.mode === 'dark' ? 'dark' : 'light');
  });

  constructor() {
    void loadMessages(this.i18n, LANGUAGES, (l) => `examples/i18n/${l}.json`);
    void fetch('examples/themes/light.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: unknown) => {
        const result = doc ? validateTheme(doc) : null;
        if (result?.valid) this.fallbackTheme.set(result.value);
      })
      .catch(() => undefined);

    effect(() => {
      const state = this.state();
      if (!state) return;
      untracked(() => {
        for (const [locale, messages] of Object.entries(state.translations)) this.i18n.addMessages(locale, messages);
        if (state.defaultLocale && this.i18n.defaultLocale() !== state.defaultLocale) this.i18n.defaultLocale.set(state.defaultLocale);
        if (this.i18n.locale() !== state.locale) this.i18n.setLocale(state.locale);
      });
    });
    effect(() => {
      const theme = this.theme() ?? this.fallbackTheme();
      if (theme) untracked(() => this.themes.apply(theme));
    });
    effect(() => (document.documentElement.lang = this.i18n.locale()));

    // Click in the capture phase: the one selecting does not reach the button or link of the component.
    const listener = (event: MouseEvent): void => this.pick(event);
    document.addEventListener('click', listener, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('click', listener, true));

    this.channel.send({ type: 'lc-preview:ready' });

    // Frame on the selected node, recomputed after every drawing: components change size when the data
    // arrive. A frame above the drawing, instead of a border on the component, moves nothing.
    let scrolledTo: string | null = null;
    // A single opening of the tabs per selection (and again after a redraw, which starts again from the first tab).
    let revealedFor: string | null = null;
    let lastDrawn: unknown[] = [];
    afterEveryRender(() => {
      const frame = this.frame()?.nativeElement;
      const state = this.state();
      const id = state?.selectedId ?? null;
      const drawn = [this.screen(), this.version()];
      if (drawn[0] !== lastDrawn[0] || drawn[1] !== lastDrawn[1]) {
        lastDrawn = drawn;
        revealedFor = null;
      }
      const node = frame && id ? frame.querySelector(`lc-node[data-node-id="${CSS.escape(id)}"]`) : null;
      if (node && id !== revealedFor) {
        revealedFor = id;
        if (revealTabs(node)) return;
      }
      const box = frame && node ? boxOf(node, frame) : null;
      if (!sameBox(box, this.highlight())) this.highlight.set(box);
      // In selection mode components are dragged; the selected one is resized if it is in a grid or a box.
      const selecting = !!state?.selectMode;
      for (const el of frame?.querySelectorAll<HTMLElement>('lc-node[data-node-id]') ?? []) {
        if (selecting && el.getAttribute('draggable') !== 'true') el.setAttribute('draggable', 'true');
        else if (!selecting && el.hasAttribute('draggable')) el.removeAttribute('draggable');
      }
      const resizable = selecting && node ? resizeTarget(node) : null;
      if (resizable !== this.resizable()) this.resizable.set(resizable);
      if (node && id !== scrolledTo) node.scrollIntoView?.({ block: 'nearest' });
      scrolledTo = node ? id : null;
      if (!id) revealedFor = null;
    });
  }

  /** Property the handle of the selected node changes (null = no handle). */
  protected readonly resizable = signal<ResizeProperty | null>(null);
  /** Resizing in progress: width shown and starting measures. */
  protected readonly resizing = signal<{ width: number; startX: number; startWidth: number } | null>(null);

  private selectedNode(): HTMLElement | null {
    const id = this.state()?.selectedId;
    const frame = this.frame()?.nativeElement;
    return id && frame ? frame.querySelector<HTMLElement>(`lc-node[data-node-id="${CSS.escape(id)}"]`) : null;
  }

  protected startResize(event: PointerEvent): void {
    const node = this.selectedNode();
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    const width = node.getBoundingClientRect().width;
    this.resizing.set({ width, startX: event.clientX, startWidth: width });
  }

  protected moveResize(event: PointerEvent): void {
    const r = this.resizing();
    if (r) this.resizing.set({ ...r, width: Math.max(20, r.startWidth + event.clientX - r.startX) });
  }

  protected endResize(event: PointerEvent): void {
    const r = this.resizing();
    this.resizing.set(null);
    const node = this.selectedNode();
    const property = this.resizable();
    const id = this.state()?.selectedId;
    if (!r || !node || !property || !id) return;
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    const width = Math.max(20, r.startWidth + event.clientX - r.startX);
    const grid = node.parentElement as HTMLElement;
    const value = resizeValue({
      property,
      startWidth: r.startWidth,
      width,
      columns: Number(grid.style.getPropertyValue('--lc-grid-columns')) || undefined,
      gridWidth: grid.getBoundingClientRect().width,
      current: parseFloat(node.style.flexGrow) || undefined,
    });
    this.channel.send({ type: 'lc-preview:resize', id, property, value });
  }

  /** In selection mode a dragged component carries its id: when dropped it becomes a move. */
  protected dragStart(event: DragEvent): void {
    if (!this.state()?.selectMode) return;
    const node = (event.target as Element | null)?.closest?.('lc-node[data-node-id]');
    if (!node || !event.dataTransfer) return;
    event.dataTransfer.setData(NODE_DRAG_TYPE, node.getAttribute('data-node-id')!);
    event.dataTransfer.effectAllowed = 'move';
  }

  /** Where the component being dragged from the palette would be dropped. */
  protected readonly dropAt = signal<{ box: Box; zone: DropZone; targetId: string | null } | null>(null);

  /**
   * Dragging from the palette of the editor onto the drawing: the innermost node under the pointer decides where (top
   * edge before, bottom edge after, centre inside if it is a container); outside the nodes, at the end of the screen.
   */
  protected dragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types ?? [];
    const moving = types.includes(NODE_DRAG_TYPE);
    if (!event.dataTransfer || (!moving && !types.includes(PALETTE_DRAG_TYPE))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = moving ? 'move' : 'copy';
    const frame = this.frame()?.nativeElement;
    if (!frame) return;
    const node = (event.target as Element | null)?.closest?.('lc-node[data-node-id]') ?? null;
    if (!node) {
      const r = frame.getBoundingClientRect();
      this.dropAt.set({ box: { top: frame.scrollHeight - 8, left: 0, width: r.width, height: 0 }, zone: 'after', targetId: null });
      return;
    }
    const rect = node.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const container = CONTAINERS.has(node.getAttribute('data-node-type') ?? '');
    const zone: DropZone = container ? (ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside') : ratio < 0.5 ? 'before' : 'after';
    // A node without size (not drawn yet) still counts as a drop point.
    const box = boxOf(node, frame) ?? { top: 0, left: 0, width: 0, height: 0 };
    this.dropAt.set({ box, zone, targetId: node.getAttribute('data-node-id') });
  }

  protected dragLeave(event: DragEvent): void {
    const frame = this.frame()?.nativeElement;
    if (!frame || !frame.contains(event.relatedTarget as Node | null)) this.dropAt.set(null);
  }

  protected drop(event: DragEvent): void {
    const at = this.dropAt();
    this.dropAt.set(null);
    if (!at) return;
    const moved = event.dataTransfer?.getData(NODE_DRAG_TYPE);
    if (moved) {
      event.preventDefault();
      if (moved !== at.targetId) this.channel.send({ type: 'lc-preview:move', id: moved, targetId: at.targetId, zone: at.zone });
      return;
    }
    const kind = event.dataTransfer?.getData(PALETTE_DRAG_TYPE);
    if (!kind) return;
    event.preventDefault();
    this.channel.send({ type: 'lc-preview:drop', kind, targetId: at.targetId, zone: at.zone });
  }

  /** With Alt or in selection mode a click chooses the component (sends its id to the editor) and does not activate it. */
  private pick(event: MouseEvent): void {
    if (!event.altKey && !this.state()?.selectMode) return;
    const target = event.target as Element | null;
    if (!target?.closest?.('.frame')) return;
    event.preventDefault();
    event.stopPropagation();
    const node = target.closest('lc-node[data-node-id]');
    if (node) this.channel.send({ type: 'lc-preview:select', id: node.getAttribute('data-node-id')! });
  }

  protected navigated(event: NavigateEvent): void {
    this.channel.event({ kind: 'navigate', text: `${event.leaf.screen} ${JSON.stringify(event.leaf.params ?? {})}` });
    this.notifier.toast(this.i18n.t('ed.preview.navigated', { screen: event.leaf.screen }));
  }
}

/** The property that is resized: `span` for a direct child of a grid, `grow` of a box; otherwise null. */
function resizeTarget(node: Element): ResizeProperty | null {
  const parent = node.parentElement;
  if (parent?.classList.contains('grid') && parent.parentElement?.tagName === 'LC-GRID') return 'span';
  if (parent?.classList.contains('box') && parent.parentElement?.tagName === 'LC-BOX') return 'grow';
  return null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function boxOf(node: Element, frame: HTMLElement): Box | null {
  const r = node.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const f = frame.getBoundingClientRect();
  return { top: r.top - f.top, left: r.left - f.left, width: r.width, height: r.height };
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}

/**
 * Opens the tabs (nested ones too) containing the node, clicking their title as the user would. The tabs
 * all stay in the page, so the node exists in a hidden tab too. Returns true if it opened something.
 */
export function revealTabs(node: Element): boolean {
  let opened = false;
  let pane = node.closest('.ant-tabs-tabpane');
  while (pane) {
    if (!pane.classList.contains('ant-tabs-tabpane-active') && pane.parentElement) {
      const index = [...pane.parentElement.children].indexOf(pane);
      const tabs = pane.closest('.ant-tabs');
      const nav = tabs ? [...tabs.children].find((c) => c.classList.contains('ant-tabs-nav')) : null;
      const title = nav?.querySelectorAll<HTMLElement>('.ant-tabs-tab .ant-tabs-tab-btn')[index];
      if (title) {
        title.click();
        opened = true;
      }
    }
    pane = pane.parentElement?.closest('.ant-tabs-tabpane') ?? null;
  }
  return opened;
}
