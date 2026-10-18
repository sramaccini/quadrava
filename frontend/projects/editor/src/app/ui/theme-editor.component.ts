import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { ThemeDefinition } from 'schema';
import { EditorStore } from '../model/editor-store';
import { NavigationStore } from '../model/navigation-store';
import { ThemeStore } from '../model/theme-store';
import { Workspace } from '../model/workspace';
import { PreviewFrameComponent } from '../preview/preview-frame.component';
import { previewState, type PreviewState } from '../preview/protocol';
import { JsonViewComponent } from './json-view.component';

/**
 * The window of a theme: the screen and the menu of the screen and navigation windows used last, drawn with the theme in
 * the preview iframe, and the JSON. The tokens are in the properties, a side panel of the workspace. Being a page of its
 * own, the theme (including the dark sheet of NG-ZORRO) applies only there: the editor stays as it is.
 */
@Component({
  selector: 'ed-theme-editor',
  imports: [JsonViewComponent, PreviewFrameComponent, NzTabsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 8px; background: var(--lc-color-background); }
    nz-tabs { padding: 0; }
    .view { flex: 1; min-height: 0; }
    .off { display: none; }
  `,
  template: `
    <div class="ed-tabs-box">
      <nz-tabs nzType="card" nzTabPosition="bottom" nzSize="small" [nzSelectedIndex]="view() === 'json' ? 1 : 0" (nzSelectedIndexChange)="view.set($event === 1 ? 'json' : 'preview')" [nzAnimated]="false">
        <nz-tab [nzTitle]="i18n.t('ed.theme.preview')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.json')"></nz-tab>
      </nz-tabs>
      <div class="view">
        @if (view() === 'json') {
          <ed-json-view />
        }
        <ed-preview-frame [state]="state()" [class.off]="view() === 'json'" />
      </div>
    </div>
  `,
})
export class ThemeEditorComponent {
  protected readonly store = inject(ThemeStore);
  private readonly workspace = inject(Workspace);
  protected readonly i18n = inject(I18n);
  protected readonly view = signal<'preview' | 'json'>('preview');

  /** The last valid theme: with errors the preview does not change. */
  private readonly theme = linkedSignal<ThemeDefinition | null, ThemeDefinition | null>({
    source: () => this.store.definition(),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });

  /** The screen and the menu open in the other windows, with the theme being edited. */
  protected readonly state = computed<PreviewState>(() => {
    const screens = this.workspace.latest('screen', EditorStore);
    return previewState({
      screen: screens?.definition() ?? null,
      navigation: this.workspace.latest('navigation', NavigationStore)?.definition() ?? null,
      theme: this.theme(),
      samples: screens?.samples() ?? {},
      locale: this.i18n.locale(),
      translations: screens?.translations() ?? {},
      defaultLocale: screens?.defaultLanguage() ?? 'en',
    });
  });
}
