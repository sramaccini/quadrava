import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { ThemeDefinition } from 'schema';
import { DocumentState } from '../model/document-state';
import { EditorStore } from '../model/editor-store';
import { NavigationStore } from '../model/navigation-store';
import { THEME, ThemeStore } from '../model/theme-store';
import { PreviewFrameComponent } from '../preview/preview-frame.component';
import { previewState, type PreviewState } from '../preview/protocol';
import { Dock } from './dock';
import { DockPanelDirective } from './dock-panel.directive';
import { DockPinComponent } from './dock-pin.component';
import { DockSideComponent } from './dock-side.component';
import { FieldsComponent } from './fields.component';
import { JsonViewComponent } from './json-view.component';

/**
 * Theme editor: on the right the tokens (colours, typography, shape, density, layout) generated from the theme schema, in the
 * centre the screen and the menu being edited, drawn with the theme in the preview iframe. Being
 * a page of its own, the theme (including the dark sheet of NG-ZORRO) applies only there: the editor stays as it is.
 */
@Component({
  selector: 'ed-theme-editor',
  imports: [DockPanelDirective, DockPinComponent, DockSideComponent, FieldsComponent, JsonViewComponent, PreviewFrameComponent, NzIconModule, NzTabsModule],
  providers: [{ provide: DocumentState, useExisting: ThemeStore }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--ed-right.px]': "dock.columnWidth('right', ['inspector'], 360)" },
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr) var(--ed-right, 360px); min-height: 0; }
    .center { display: flex; flex-direction: column; min-height: 0; padding: 8px; background: var(--lc-color-background); }
    .center nz-tabs { padding: 0; }
    .center ::ng-deep .ant-tabs-nav { margin: 0; }
    .view { flex: 1; min-height: 0; }
    .off { display: none; }
    .right { border-left: 1px solid var(--lc-color-border); }
    .right .ed-panel { flex: 1 1 0; }
    .note { margin: 0 0 12px; font-size: 12px; color: var(--lc-color-muted); }
  `,
  template: `
    <main class="center">
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
    </main>
    <ed-dock-side side="right" [width]="360" [panels]="[{ id: 'inspector', label: i18n.t('ed.inspector'), icon: 'control' }]">
      <section class="ed-panel" edDockPanel="inspector" [attr.aria-label]="i18n.t('ed.inspector')">
        <h2 class="ed-panel-title"><span nz-icon nzType="control" aria-hidden="true"></span>{{ i18n.t('ed.inspector') }}<ed-dock-pin panel="inspector" /></h2>
        <div class="ed-panel-body">
          <p class="note">{{ i18n.t('ed.theme.note') }}</p>
          <ed-fields [path]="[]" [fields]="fields" />
        </div>
      </section>
    </ed-dock-side>
  `,
})
export class ThemeEditorComponent {
  protected readonly store = inject(ThemeStore);
  protected readonly dock = inject(Dock);
  private readonly screens = inject(EditorStore);
  private readonly menus = inject(NavigationStore);
  protected readonly i18n = inject(I18n);
  protected readonly fields = THEME.rootProperties();
  protected readonly view = signal<'preview' | 'json'>('preview');

  /** The last valid theme: with errors the preview does not change. */
  private readonly theme = linkedSignal<ThemeDefinition | null, ThemeDefinition | null>({
    source: () => this.store.definition(),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });

  /** The screen and the menu open in the other modes, with the theme being edited. */
  protected readonly state = computed<PreviewState>(() =>
    previewState({
      screen: this.screens.definition(),
      navigation: this.menus.definition(),
      theme: this.theme(),
      samples: this.screens.samples(),
      locale: this.i18n.locale(),
      translations: this.screens.translations(),
      defaultLocale: this.screens.defaultLanguage(),
    }),
  );
}
