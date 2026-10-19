import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { ProjectLibrary } from '../model/project-library';

/** A choice of the start page: the application carries it out (dialogs, permissions, opening the project). */
export type StartCommand =
  | { kind: 'new' }
  | { kind: 'open-disk' }
  | { kind: 'demo' }
  | { kind: 'import-zip' }
  | { kind: 'reopen' }
  | { kind: 'open-browser'; name: string }
  | { kind: 'delete-browser'; name: string };

/**
 * What Studio shows when no project is open: create a project, open a folder on disk, open the demo project, reopen the last
 * one, or one of those kept in this browser.
 */
@Component({
  selector: 'ed-start-page',
  imports: [NzButtonModule, NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; align-items: center; justify-content: center; height: 100%; padding: 24px; overflow: auto; }
    .start { max-width: 560px; width: 100%; }
    h2 { margin: 0 0 4px; font-size: 20px; }
    p { margin: 0 0 16px; color: var(--lc-color-muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
    h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--lc-color-muted); }
    ul { list-style: none; margin: 0 0 16px; padding: 0; border: 1px solid var(--lc-color-border); border-radius: var(--lc-radius); background: var(--lc-color-surface); }
    li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
    li + li { border-top: 1px solid var(--lc-color-border); }
    li .open { flex: 1; justify-content: flex-start; }
  `,
  template: `
    <section class="start" [attr.aria-label]="i18n.t('ed.start.title')">
      <h2>{{ i18n.t('ed.start.title') }}</h2>
      <p>{{ i18n.t('ed.start.hint') }}</p>
      <div class="actions">
        <button nz-button nzType="primary" type="button" data-start="new" (click)="command.emit({ kind: 'new' })"><span nz-icon nzType="plus"></span>{{ i18n.t('ed.start.new') }}</button>
        @if (library.canUseDisk()) {
          <button nz-button type="button" data-start="open-disk" (click)="command.emit({ kind: 'open-disk' })"><span nz-icon nzType="folder-open"></span>{{ i18n.t('ed.start.openDisk') }}</button>
        }
        <button nz-button type="button" data-start="demo" (click)="command.emit({ kind: 'demo' })"><span nz-icon nzType="appstore"></span>{{ i18n.t('ed.start.demo') }}</button>
        <button nz-button type="button" data-start="import-zip" (click)="command.emit({ kind: 'import-zip' })"><span nz-icon nzType="upload"></span>{{ i18n.t('ed.menu.importProject') }}</button>
        @if (library.last(); as last) {
          <button nz-button type="button" data-start="reopen" (click)="command.emit({ kind: 'reopen' })">
            <span nz-icon nzType="history"></span>{{ i18n.t('ed.start.reopen', { name: last.name }) }}
          </button>
        }
      </div>
      @if (library.browserProjects().length) {
        <h3>{{ i18n.t('ed.start.inBrowser') }}</h3>
        <ul>
          @for (name of library.browserProjects(); track name) {
            <li>
              <button nz-button nzType="text" type="button" class="open" [attr.data-browser-project]="name" (click)="command.emit({ kind: 'open-browser', name })">
                <span nz-icon nzType="folder"></span>{{ name }}
              </button>
              <button nz-button nzType="text" nzDanger type="button" (click)="command.emit({ kind: 'delete-browser', name })" [attr.aria-label]="i18n.t('ed.start.delete', { name })" [nz-tooltip]="i18n.t('ed.start.delete', { name })">
                <span nz-icon nzType="delete"></span>
              </button>
            </li>
          }
        </ul>
      }
      <p>{{ i18n.t(library.canUseDisk() ? 'ed.start.whereDisk' : 'ed.start.whereBrowser') }}</p>
    </section>
  `,
})
export class StartPageComponent {
  protected readonly library = inject(ProjectLibrary);
  protected readonly i18n = inject(I18n);
  readonly command = output<StartCommand>();

  constructor() {
    void this.library.refresh().catch(() => undefined);
  }
}
