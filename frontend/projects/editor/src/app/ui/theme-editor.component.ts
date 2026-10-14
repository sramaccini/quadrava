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
 * Editor del tema: a destra i token (colori, tipografia, forma, densità, layout) generati dallo schema dei temi, al
 * centro la schermata e il menu che si stanno modificando, disegnati con il tema nell'iframe dell'anteprima. Essendo
 * una pagina a sé, il tema (compreso il foglio scuro di NG-ZORRO) vale solo lì: l'editor resta com'è.
 */
@Component({
  selector: 'ed-theme-editor',
  imports: [DockPanelDirective, DockPinComponent, DockSideComponent, FieldsComponent, JsonViewComponent, PreviewFrameComponent, NzIconModule, NzTabsModule],
  providers: [{ provide: DocumentState, useExisting: ThemeStore }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--ed-right.px]': "dock.columnWidth('right', ['inspector'], 360)" },
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr) var(--ed-right, 360px); min-height: 0; }
    .center { display: flex; flex-direction: column; min-height: 0; }
    .center nz-tabs { padding: 0 12px; background: var(--lc-color-surface); }
    .center ::ng-deep .ant-tabs-nav { margin: 0; }
    .view { flex: 1; min-height: 0; }
    .off { display: none; }
    .right { border-left: 1px solid var(--lc-color-border); }
    .right .ed-panel { flex: 1 1 0; }
    .note { margin: 0 0 12px; font-size: 12px; color: var(--lc-color-muted); }
  `,
  template: `
    <main class="center">
      <nz-tabs nzSize="small" [nzSelectedIndex]="view() === 'json' ? 1 : 0" (nzSelectedIndexChange)="view.set($event === 1 ? 'json' : 'preview')" [nzAnimated]="false">
        <nz-tab [nzTitle]="i18n.t('ed.theme.preview')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.json')"></nz-tab>
      </nz-tabs>
      <div class="view">
        @if (view() === 'json') {
          <ed-json-view />
        }
        <ed-preview-frame [state]="state()" [class.off]="view() === 'json'" />
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

  /** L'ultimo tema valido: con errori l'anteprima non cambia. */
  private readonly theme = linkedSignal<ThemeDefinition | null, ThemeDefinition | null>({
    source: () => this.store.definition(),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });

  /** La schermata e il menu aperti nelle altre modalità, con il tema in modifica. */
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
