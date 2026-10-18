import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { resizeBounds, type Bounds, type Edge } from '../model/window-layout';
import { Workspace, type DocumentWindow } from '../model/workspace';

/** Icon of every kind of document (title bar of the window, bar of the workspace). */
export const KIND_ICONS: Record<DocumentWindow['kind'], string> = { screen: 'layout', navigation: 'menu', theme: 'bg-colors' };
/** Step of the movements and resizings from the keyboard. */
const KEY_STEP = 16;
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
/** Class of the page while a window is dragged: the iframes do not take the pointer (see styles.scss). */
const DRAGGING = 'ed-window-dragging';

/**
 * A document window inside the workspace, as in MDI applications: title bar (drag to move, double click to maximize),
 * buttons to minimize, maximize or restore and close, edges and corners to resize. A click or the focus inside brings it in
 * front and makes it the active one. From the keyboard, on the title: arrows move it, Shift+arrows resize it, Enter
 * maximizes or restores it.
 */
@Component({
  selector: 'ed-document-window',
  imports: [NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region',
    '[attr.aria-label]': 'title()',
    '[attr.data-window]': 'window().id',
    '[attr.data-kind]': 'window().kind',
    '[class.active]': 'active()',
    '[class.maximized]': 'window().maximized()',
    '[class.minimized]': 'window().minimized()',
    '[style.left.px]': 'window().bounds().x',
    '[style.top.px]': 'window().bounds().y',
    '[style.width.px]': 'window().bounds().width',
    '[style.height.px]': 'window().bounds().height',
    '[style.z-index]': 'workspace.layer(window().id)',
    '(pointerdown)': 'activate()',
    '(focusin)': 'activate()',
  },
  styles: `
    :host {
      position: absolute; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden;
      background: var(--lc-color-surface); border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius);
      box-shadow: 0 4px 16px rgb(0 0 0 / 14%);
    }
    :host(.active) { border-color: var(--lc-color-primary); box-shadow: 0 8px 28px rgb(0 0 0 / 24%); }
    :host(.maximized) { inset: 0 !important; width: auto !important; height: auto !important; border-radius: 0; box-shadow: none; }
    :host(.minimized) { display: none; }
    .titlebar {
      flex: none; display: flex; align-items: center; gap: 4px; padding: 0 4px 0 0; user-select: none;
      background: color-mix(in srgb, var(--lc-color-on-surface) 7%, var(--lc-color-surface)); color: var(--lc-color-on-surface);
      border-bottom: 1px solid var(--lc-color-border);
    }
    :host(.active) .titlebar { background: var(--ed-panel-title-bg); color: var(--ed-panel-title-fg); }
    .caption {
      flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 5px 10px; border: 0; background: none;
      color: inherit; font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: default; touch-action: none;
    }
    .caption:focus-visible, .control:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
    .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .unsaved { flex: none; width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: 0.8; }
    .control {
      flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 24px; padding: 0;
      border: 0; border-radius: 4px; background: none; color: inherit; font-size: 13px; cursor: pointer;
    }
    .control:hover { background: color-mix(in srgb, currentColor 16%, transparent); }
    .control.close:hover { background: var(--lc-color-danger); color: var(--ed-panel-title-fg); }
    .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .body > * { flex: 1; min-height: 0; }
    .edge { position: absolute; z-index: 2; touch-action: none; }
    :host(.maximized) .edge { display: none; }
    .edge.n, .edge.s { left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
    .edge.e, .edge.w { top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
    .edge.n { top: -3px; } .edge.s { bottom: -3px; } .edge.e { right: -3px; } .edge.w { left: -3px; }
    .edge.ne, .edge.nw, .edge.se, .edge.sw { width: 12px; height: 12px; }
    .edge.ne { top: -3px; right: -3px; cursor: nesw-resize; } .edge.sw { bottom: -3px; left: -3px; cursor: nesw-resize; }
    .edge.nw { top: -3px; left: -3px; cursor: nwse-resize; } .edge.se { bottom: -3px; right: -3px; cursor: nwse-resize; }
  `,
  template: `
    <div class="titlebar">
      <button
        type="button"
        class="caption"
        [attr.aria-description]="i18n.t('ed.window.keys')"
        (pointerdown)="drag($event)"
        (dblclick)="workspace.toggleMaximize(window().id)"
        (keydown)="key($event)"
      >
        <span nz-icon [nzType]="icon()" aria-hidden="true"></span>
        <span class="name">{{ title() }}</span>
        @if (unsaved()) {
          <span class="unsaved" data-unsaved [attr.title]="i18n.t('ed.unsaved')" [attr.aria-label]="i18n.t('ed.unsaved')" role="img"></span>
        }
      </button>
      <button type="button" class="control" data-control="minimize" (click)="workspace.minimize(window().id)" [attr.aria-label]="i18n.t('ed.window.minimize')" [nz-tooltip]="i18n.t('ed.window.minimize')">
        <span nz-icon nzType="minus" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="control"
        data-control="maximize"
        (click)="workspace.toggleMaximize(window().id)"
        [attr.aria-label]="i18n.t(window().maximized() ? 'ed.window.restore' : 'ed.window.maximize')"
        [nz-tooltip]="i18n.t(window().maximized() ? 'ed.window.restore' : 'ed.window.maximize')"
      >
        <span nz-icon [nzType]="window().maximized() ? 'shrink' : 'border'" aria-hidden="true"></span>
      </button>
      <button type="button" class="control close" data-control="close" (click)="closing.emit()" [attr.aria-label]="i18n.t('ed.window.close')" [nz-tooltip]="i18n.t('ed.window.close')">
        <span nz-icon nzType="close" aria-hidden="true"></span>
      </button>
    </div>
    <div class="body"><ng-content /></div>
    @for (edge of edges; track edge) {
      <div class="edge" [class]="edge" [attr.data-edge]="edge" aria-hidden="true" (pointerdown)="drag($event, edge)"></div>
    }
  `,
})
export class DocumentWindowComponent {
  readonly window = input.required<DocumentWindow>();
  readonly title = input.required<string>();
  readonly active = input(false);
  readonly unsaved = input(false);
  /** The close button: whoever hosts the window asks for confirmation if there are unsaved changes. */
  readonly closing = output<void>();
  protected readonly workspace = inject(Workspace);
  protected readonly i18n = inject(I18n);
  private readonly document = inject(DOCUMENT);
  protected readonly edges = EDGES;

  protected icon(): string {
    return KIND_ICONS[this.window().kind];
  }

  protected activate(): void {
    this.workspace.focus(this.window().id);
  }

  /** Dragging the title moves the window; dragging an edge or a corner resizes it. Not when maximized. */
  protected drag(event: PointerEvent, edge?: Edge): void {
    const win = this.window();
    if (event.button !== 0 || win.maximized()) return;
    // The buttons of the title bar work as buttons.
    if (!edge && (event.target as Element).closest('.control')) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const start = win.bounds();
    const startX = event.clientX;
    const startY = event.clientY;
    handle.setPointerCapture?.(event.pointerId);
    this.document.body.classList.add(DRAGGING);
    const move = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (edge) this.workspace.place(win.id, resizeBounds(start, edge, dx, dy, this.workspace.area()));
      else this.workspace.place(win.id, { ...start, x: start.x + dx, y: start.y + dy });
    };
    const end = () => {
      this.document.body.classList.remove(DRAGGING);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** From the keyboard on the title: arrows move, Shift+arrows resize, Enter maximizes or restores. */
  protected key(event: KeyboardEvent): void {
    const win = this.window();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.workspace.toggleMaximize(win.id);
      return;
    }
    const delta: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    const step = delta[event.key];
    if (!step || win.maximized() || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    const bounds: Bounds = win.bounds();
    const [dx, dy] = step;
    if (event.shiftKey) this.workspace.place(win.id, resizeBounds(bounds, 'se', dx, dy, this.workspace.area()));
    else this.workspace.place(win.id, { ...bounds, x: bounds.x + dx, y: bounds.y + dy });
  }
}
