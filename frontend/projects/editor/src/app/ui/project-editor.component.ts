import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { isObject } from '../model/doc-ops';
import { Project, type ResourceKind } from '../model/project';
import { ProjectStore } from '../model/project-store';
import { JsonViewComponent } from './json-view.component';

const COUNTED: ResourceKind[] = ['screen', 'datasources', 'navigation', 'theme'];

/**
 * The window of the project settings (project.json): an overview of the application (name, languages, themes, how many
 * resources of every kind) and the JSON. The settings are edited in the properties.
 */
@Component({
  selector: 'ed-project-editor',
  imports: [JsonViewComponent, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 8px; background: var(--lc-color-background); }
    nz-tabs { padding: 0; }
    .view { flex: 1; min-height: 0; }
    .overview { height: 100%; overflow: auto; padding: 16px 20px; }
    h2 { margin: 0 0 4px; font-size: 20px; }
    .description { margin: 0 0 16px; color: var(--lc-color-muted); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
    dt { color: var(--lc-color-muted); }
    dd { margin: 0; }
  `,
  template: `
    <div class="ed-tabs-box">
      <nz-tabs nzType="card" nzTabPosition="bottom" nzSize="small" [nzSelectedIndex]="view() === 'json' ? 1 : 0" (nzSelectedIndexChange)="view.set($event === 1 ? 'json' : 'overview')" [nzAnimated]="false">
        <nz-tab [nzTitle]="i18n.t('ed.project.overview')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.json')"></nz-tab>
      </nz-tabs>
      <div class="view">
        @if (view() === 'json') {
          <ed-json-view />
        } @else {
          <section class="overview" [attr.aria-label]="i18n.t('ed.project.overview')">
            <h2>{{ summary().name }}</h2>
            @if (summary().description) {
              <p class="description">{{ summary().description }}</p>
            }
            <dl>
              <dt>{{ i18n.t('ed.project.id') }}</dt>
              <dd><code>{{ summary().id }}</code></dd>
              <dt>{{ i18n.t('ed.project.languages') }}</dt>
              <dd>{{ summary().languages }}</dd>
              <dt>{{ i18n.t('ed.project.themes') }}</dt>
              <dd>{{ summary().themes }}</dd>
              @for (count of counts(); track count.kind) {
                <dt>{{ i18n.t('ed.project.group.' + count.kind) }}</dt>
                <dd>{{ count.n }}</dd>
              }
            </dl>
          </section>
        }
      </div>
    </div>
  `,
})
export class ProjectEditorComponent {
  protected readonly i18n = inject(I18n);
  private readonly store = inject(ProjectStore);
  private readonly project = inject(Project);
  protected readonly view = signal<'overview' | 'json'>('overview');

  protected readonly summary = computed(() => {
    const doc = this.store.doc();
    const value = (key: string): unknown => (isObject(doc) ? doc[key] : undefined);
    const list = (key: string): string => (Array.isArray(value(key)) ? (value(key) as unknown[]).join(', ') : '');
    const all = this.project.resources().filter((r) => r.kind === 'theme').map((r) => r.id);
    return {
      name: String(value('name') ?? ''),
      description: typeof value('description') === 'string' ? String(value('description')) : '',
      id: String(value('project') ?? ''),
      languages: `${list('languages')} (${this.i18n.t('ed.project.default', { language: String(value('defaultLanguage') ?? '') })})`,
      themes: list('themes') || all.join(', '),
    };
  });

  protected readonly counts = computed(() => COUNTED.map((kind) => ({ kind, n: this.project.resources().filter((r) => r.kind === kind).length })));
}
