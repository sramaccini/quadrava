import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, output } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import type { EditorKind } from '../model/saved-documents';
import { Workspace, type DocumentWindow } from '../model/workspace';
import { DocumentWindowComponent, KIND_ICONS } from './document-window.component';
import { DataSourcesEditorComponent } from './datasources-editor.component';
import { MessagesEditorComponent } from './messages-editor.component';
import { NavigationEditorComponent } from './navigation-editor.component';
import { ProjectEditorComponent } from './project-editor.component';
import { ScreenEditorComponent } from './screen-editor.component';
import { ThemeEditorComponent } from './theme-editor.component';

/** Title of a window: the identifier of its document (or «Untitled») and its kind. */
export function windowTitle(i18n: I18n, workspace: Workspace, win: DocumentWindow): string {
  if (win.kind === 'project') return i18n.t('ed.project.settingsOf', { name: workspace.name(win) ?? i18n.t('ed.window.untitled') });
  return i18n.t('ed.window.title', { name: workspace.name(win) ?? i18n.t('ed.window.untitled'), kind: i18n.t('ed.kind.' + win.kind) });
}

/** A command of the empty workspace (the same ones of the File menu). */
export type WorkspaceCommand = { kind: 'new'; document: EditorKind } | { kind: 'open' };
/** Kinds offered by the empty workspace. */
const CREATABLE: EditorKind[] = ['screen', 'datasources', 'navigation', 'theme'];

/**
 * The area of the document windows (see `Workspace`) with, below, the bar of the open documents: a button per window
 * (the active one pressed; a click brings it in front or restores it). Every window has the editor of its kind, created with
 * the injector of the window, so it works on its own document. Without documents the area invites to create or open one.
 */
@Component({
  selector: 'ed-workspace',
  imports: [
    NgTemplateOutlet,
    DataSourcesEditorComponent,
    DocumentWindowComponent,
    MessagesEditorComponent,
    NavigationEditorComponent,
    ProjectEditorComponent,
    ScreenEditorComponent,
    ThemeEditorComponent,
    NzButtonModule,
    NzIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--lc-color-background); }
    .area { position: relative; flex: 1; min-height: 0; overflow: hidden; }
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; height: 100%; padding: 24px; text-align: center; }
    .empty h2 { margin: 0; font-size: 18px; font-weight: 600; }
    .empty p { margin: 0; color: var(--lc-color-muted); }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
    .taskbar {
      flex: none; display: flex; gap: 2px; padding: 3px 6px; overflow-x: auto; list-style: none; margin: 0;
      background: var(--lc-color-surface); border-top: 1px solid var(--lc-color-border);
    }
    .task {
      display: inline-flex; align-items: center; gap: 6px; max-width: 240px; padding: 2px 10px; border: 1px solid transparent;
      border-radius: var(--lc-radius); background: none; color: inherit; font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
    }
    .task:hover { background: color-mix(in srgb, var(--lc-color-on-surface) 7%, transparent); }
    .task[aria-pressed='true'] { border-color: var(--lc-color-primary); background: color-mix(in srgb, var(--lc-color-primary) 12%, transparent); font-weight: 600; }
    .task.minimized { font-style: italic; color: var(--lc-color-muted); }
    .task:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -2px; }
    .task .name { overflow: hidden; text-overflow: ellipsis; }
  `,
  template: `
    <div class="area">
      @for (win of workspace.windows(); track win.id) {
        <ed-document-window [window]="win" [title]="title(win)" [active]="workspace.active() === win" [unsaved]="unsaved(win)" (closing)="closing.emit(win)">
          <ng-container *ngTemplateOutlet="editor; context: { $implicit: win.kind }; injector: win.injector" />
        </ed-document-window>
      } @empty {
        <div class="empty">
          <h2>{{ i18n.t('ed.workspace.empty') }}</h2>
          <p>{{ i18n.t('ed.workspace.emptyHint') }}</p>
          <div class="actions">
            @for (kind of kinds; track kind) {
              <button nz-button type="button" [attr.data-new]="kind" (click)="command.emit({ kind: 'new', document: kind })">
                <span nz-icon [nzType]="icons[kind]" aria-hidden="true"></span>{{ i18n.t('ed.new.' + kind) }}
              </button>
            }
            <button nz-button type="button" data-open (click)="command.emit({ kind: 'open' })">
              <span nz-icon nzType="folder-open" aria-hidden="true"></span>{{ i18n.t('ed.menu.import') }}
            </button>
          </div>
        </div>
      }
    </div>
    @if (workspace.windows().length) {
      <ul class="taskbar" [attr.aria-label]="i18n.t('ed.workspace.documents')">
        @for (win of workspace.windows(); track win.id) {
          <li>
            <button
              type="button"
              class="task"
              [class.minimized]="win.minimized()"
              [attr.data-task]="win.id"
              [attr.aria-pressed]="workspace.active() === win"
              (click)="workspace.active() === win ? workspace.minimize(win.id) : workspace.focus(win.id)"
            >
              <span nz-icon [nzType]="icons[win.kind]" aria-hidden="true"></span><span class="name">{{ title(win) }}</span>
              @if (unsaved(win)) {
                <span aria-hidden="true">•</span>
              }
            </button>
          </li>
        }
      </ul>
    }

    <ng-template #editor let-kind>
      @switch (kind) {
        @case ('screen') {
          <ed-screen-editor />
        }
        @case ('navigation') {
          <ed-navigation-editor />
        }
        @case ('theme') {
          <ed-theme-editor />
        }
        @case ('datasources') {
          <ed-datasources-editor />
        }
        @case ('project') {
          <ed-project-editor />
        }
        @case ('messages') {
          <ed-messages-editor />
        }
      }
    </ng-template>
  `,
})
export class WorkspaceComponent {
  protected readonly workspace = inject(Workspace);
  protected readonly i18n = inject(I18n);
  /** The close button of a window (the application asks for confirmation if there are unsaved changes). */
  readonly closing = output<DocumentWindow>();
  readonly command = output<WorkspaceCommand>();
  protected readonly kinds = CREATABLE;
  protected readonly icons = KIND_ICONS;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    const destroy = inject(DestroyRef);
    // The size of the area limits the windows (moving, resizing, tiling); it is followed when the page changes size.
    afterNextRender(() => {
      const area = host.nativeElement.querySelector('.area') as HTMLElement;
      const measure = () => this.workspace.resizeArea({ width: area.clientWidth, height: area.clientHeight });
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(area);
      destroy.onDestroy(() => observer.disconnect());
    });
  }

  protected title(win: DocumentWindow): string {
    return windowTitle(this.i18n, this.workspace, win);
  }

  protected unsaved(win: DocumentWindow): boolean {
    return this.workspace.isUnsaved(win);
  }
}
