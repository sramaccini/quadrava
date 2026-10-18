import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { EditorStore } from '../model/editor-store';
import { PreviewComponent } from '../preview/preview.component';
import { DataSourcesComponent } from './data-sources.component';
import { JsonViewComponent } from './json-view.component';
import { TextsComponent } from './texts.component';

export const SCREEN_VIEWS = ['preview', 'json', 'sources', 'texts'] as const;

/**
 * The window of a screen: preview, JSON, data sources and texts, with the tabs below. Palette, outline and properties
 * are the side panels of the workspace, showing the screen of the active window.
 */
@Component({
  selector: 'ed-screen-editor',
  imports: [DataSourcesComponent, JsonViewComponent, PreviewComponent, TextsComponent, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 8px; background: var(--lc-color-background); }
    nz-tabs { padding: 0; }
    .view { flex: 1; min-height: 0; }
    .pane { height: 100%; }
    .pane.off { display: none; }
  `,
  template: `
    <div class="ed-tabs-box">
      <nz-tabs nzType="card" nzTabPosition="bottom" nzSize="small" [nzSelectedIndex]="viewIndex()" (nzSelectedIndexChange)="setView($event)" [nzAnimated]="false">
        <nz-tab [nzTitle]="i18n.t('ed.tabs.preview')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.json')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.sources')"></nz-tab>
        <nz-tab [nzTitle]="store.textsToFix() ? i18n.t('ed.tabs.textsTodo', { n: store.textsToFix() }) : i18n.t('ed.tabs.texts')"></nz-tab>
      </nz-tabs>
      <div class="view">
        <!-- The preview stays alive (hidden) in the other views: its iframe does not reload at every change. -->
        <div class="pane" [class.off]="store.view() !== 'preview'"><ed-preview /></div>
        @switch (store.view()) {
          @case ('json') {
            <ed-json-view />
          }
          @case ('sources') {
            <ed-data-sources />
          }
          @case ('texts') {
            <ed-texts />
          }
        }
      </div>
    </div>
  `,
})
export class ScreenEditorComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly viewIndex = computed(() => SCREEN_VIEWS.indexOf(this.store.view()));

  protected setView(index: number): void {
    this.store.view.set(SCREEN_VIEWS[index] ?? 'preview');
  }
}
