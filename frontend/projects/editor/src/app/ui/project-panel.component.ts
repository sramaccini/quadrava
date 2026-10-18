import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { Project, type ProjectResource, type ResourceKind } from '../model/project';
import { Workspace } from '../model/workspace';
import { DockPinComponent } from './dock-pin.component';
import { KIND_ICONS } from './document-window.component';

/** Groups of the panel, in order; `creatable` kinds have a «+» to add one. */
const GROUPS: { kind: ResourceKind; creatable: boolean }[] = [
  { kind: 'project', creatable: false },
  { kind: 'screen', creatable: true },
  { kind: 'datasources', creatable: true },
  { kind: 'navigation', creatable: true },
  { kind: 'theme', creatable: true },
  { kind: 'messages', creatable: true },
];

interface Item {
  resource: ProjectResource;
  label: string;
  open: boolean;
  unsaved: boolean;
  severity: 'error' | 'warning' | null;
}

/**
 * The resources of the open project, as the solution explorer of an IDE: settings, screens, data sources, navigation,
 * themes. A click (or Enter) opens a resource in its window or brings it in front; «+» on a group creates one, the bin (or
 * Del on the row) deletes it after a confirmation. The resources open in a window show their unsaved changes and problems.
 */
@Component({
  selector: 'ed-project-panel',
  imports: [DockPinComponent, NzButtonModule, NzIconModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; }
    .ed-panel { flex: 1 1 auto; }
    .name { margin: 0 0 8px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .location { display: block; font-size: 12px; font-weight: 400; color: var(--lc-color-muted); }
    .group { margin: 0 0 6px; }
    .group-head { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--lc-color-muted); }
    .group-head .count { font-weight: 400; }
    .group-head button { margin-left: auto; }
    ul { list-style: none; margin: 0; padding: 0; }
    .line { display: flex; align-items: center; border-radius: var(--lc-radius); }
    .line.active { background: color-mix(in srgb, var(--lc-color-primary) 14%, transparent); }
    .row {
      flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 3px 6px; border: 0; border-radius: var(--lc-radius);
      background: none; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    }
    .row:hover { background: color-mix(in srgb, var(--lc-color-on-surface) 6%, transparent); }
    .row:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -2px; }
    .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row.open .label { font-weight: 600; }
    .mark { flex: none; width: 8px; height: 8px; border-radius: 50%; }
    .mark.error { background: var(--lc-color-danger); }
    .mark.warning { background: var(--lc-color-warning, #d48806); }
    .unsaved { flex: none; color: var(--lc-color-muted); }
    .delete { opacity: 0; }
    .line:hover .delete, .line:focus-within .delete { opacity: 1; }
    .none { margin: 0 0 0 22px; font-size: 12px; color: var(--lc-color-muted); }
  `,
  template: `
    <nav class="ed-panel" [attr.aria-label]="i18n.t('ed.project.panel')">
      <h2 class="ed-panel-title"><span nz-icon nzType="folder" aria-hidden="true"></span>{{ i18n.t('ed.project.panel') }}<ed-dock-pin panel="project" /></h2>
      <div class="ed-panel-body">
        @if (project.manifest(); as manifest) {
          <p class="name">
            {{ manifest.name }}
            <span class="location">{{ i18n.t('ed.project.where.' + (project.folder()?.location ?? 'memory'), { name: project.folder()?.name ?? '' }) }}</span>
          </p>
        }
        @for (group of groups(); track group.kind) {
          <section class="group" [attr.data-group]="group.kind" [attr.aria-label]="group.title">
            <h3 class="group-head">
              <span nz-icon [nzType]="icons[group.kind]" aria-hidden="true"></span>{{ group.title }}
              @if (group.kind !== 'project' && group.kind !== 'navigation') {
                <span class="count">({{ group.items.length }})</span>
              }
              @if (group.creatable) {
                <button nz-button nzType="text" nzSize="small" type="button" [attr.data-create]="group.kind" (click)="create.emit(group.kind)" [attr.aria-label]="i18n.t('ed.project.new', { kind: group.title })" [nz-tooltip]="i18n.t('ed.project.new', { kind: group.title })">
                  <span nz-icon nzType="plus"></span>
                </button>
              }
            </h3>
            <ul>
              @for (item of group.items; track item.resource.path) {
                <li class="line" [class.active]="activePath() === item.resource.path">
                  <button type="button" class="row" [class.open]="item.open" [attr.data-resource]="item.resource.path" [attr.aria-current]="activePath() === item.resource.path ? 'true' : null" (click)="open(item.resource)" (keydown.delete)="item.resource.kind !== 'project' && remove.emit(item.resource)">
                    <span class="label">{{ item.label }}</span>
                    @if (item.severity; as s) {
                      <span class="mark" [class]="s" role="img" [attr.aria-label]="i18n.t('ed.has.' + s)" [attr.title]="i18n.t('ed.has.' + s)"></span>
                    }
                    @if (item.unsaved) {
                      <span class="unsaved" role="img" [attr.aria-label]="i18n.t('ed.unsaved')" [attr.title]="i18n.t('ed.unsaved')">●</span>
                    }
                  </button>
                  @if (item.resource.kind !== 'project') {
                    <button nz-button nzType="text" nzSize="small" nzDanger type="button" class="delete" [attr.data-delete]="item.resource.path" (click)="remove.emit(item.resource)" [attr.aria-label]="i18n.t('ed.project.delete', { name: item.label })" [nz-tooltip]="i18n.t('ed.project.delete', { name: item.label })">
                      <span nz-icon nzType="delete"></span>
                    </button>
                  }
                </li>
              } @empty {
                <li class="none">{{ i18n.t('ed.project.none') }}</li>
              }
            </ul>
          </section>
        }
      </div>
    </nav>
  `,
})
export class ProjectPanelComponent {
  protected readonly project = inject(Project);
  protected readonly i18n = inject(I18n);
  private readonly workspace = inject(Workspace);
  private readonly notifier = inject(Notifier);
  /** «+» on a group: the application asks for the name and creates the resource. */
  readonly create = output<ResourceKind>();
  /** The bin (or Del) on a resource: the application asks for confirmation and deletes it. */
  readonly remove = output<ProjectResource>();
  protected readonly icons = KIND_ICONS;

  protected readonly activePath = computed(() => this.workspace.active()?.path() ?? null);

  protected readonly groups = computed(() => {
    const resources = this.project.resources();
    const windows = this.workspace.windows();
    return GROUPS.map(({ kind, creatable }) => ({
      kind,
      creatable: creatable && !(kind === 'navigation' && resources.some((r) => r.kind === 'navigation')),
      title: this.i18n.t('ed.project.group.' + kind),
      items: resources
        .filter((r) => r.kind === kind)
        .map((resource): Item => {
          const win = windows.find((w) => w.path() === resource.path);
          const errors = win ? win.state.errorCount() : 0;
          return {
            resource,
            label: kind === 'project' ? this.i18n.t('ed.project.settings') : kind === 'navigation' ? this.i18n.t('ed.project.group.navigation') : resource.id,
            open: !!win,
            unsaved: !!win && this.workspace.isUnsaved(win),
            severity: !win ? null : errors ? 'error' : win.state.issues().length ? 'warning' : null,
          };
        }),
    }));
  });

  protected async open(resource: ProjectResource): Promise<void> {
    try {
      await this.workspace.openResource(resource);
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }
}
