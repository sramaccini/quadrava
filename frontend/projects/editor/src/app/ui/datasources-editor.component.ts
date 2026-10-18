import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { DataSourcesComponent } from './data-sources.component';
import { JsonViewComponent } from './json-view.component';

/**
 * The window of a data sources document of the project: its data sources (method, URL, parameters, body, paging, sample
 * data), as the «Data sources» tab of a screen, and the JSON. Identifier and description are in the properties.
 */
@Component({
  selector: 'ed-datasources-editor',
  imports: [DataSourcesComponent, JsonViewComponent, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 8px; background: var(--lc-color-background); }
    nz-tabs { padding: 0; }
    .view { flex: 1; min-height: 0; }
  `,
  template: `
    <div class="ed-tabs-box">
      <nz-tabs nzType="card" nzTabPosition="bottom" nzSize="small" [nzSelectedIndex]="view() === 'json' ? 1 : 0" (nzSelectedIndexChange)="view.set($event === 1 ? 'json' : 'sources')" [nzAnimated]="false">
        <nz-tab [nzTitle]="i18n.t('ed.tabs.sources')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.json')"></nz-tab>
      </nz-tabs>
      <div class="view">
        @if (view() === 'json') {
          <ed-json-view />
        } @else {
          <ed-data-sources />
        }
      </div>
    </div>
  `,
})
export class DataSourcesEditorComponent {
  protected readonly i18n = inject(I18n);
  protected readonly view = signal<'sources' | 'json'>('sources');
}
