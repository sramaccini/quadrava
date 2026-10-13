import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { I18n } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { ThemeDefinition } from 'schema';
import { DocumentState } from '../model/document-state';
import { EditorStore } from '../model/editor-store';
import { NavigationStore } from '../model/navigation-store';
import { THEME, ThemeStore } from '../model/theme-store';
import { PreviewFrameComponent } from '../preview/preview-frame.component';
import { previewState, type PreviewState } from '../preview/protocol';
import { FieldsComponent } from './fields.component';
import { JsonViewComponent } from './json-view.component';

/**
 * Editor del tema: a destra i token (colori, tipografia, forma, densità, layout) generati dallo schema dei temi, al
 * centro la schermata e il menu che si stanno modificando, disegnati con il tema nell'iframe dell'anteprima. Essendo
 * una pagina a sé, il tema (compreso il foglio scuro di NG-ZORRO) vale solo lì: l'editor resta com'è.
 */
@Component({
  selector: 'ed-theme-editor',
  imports: [FieldsComponent, JsonViewComponent, PreviewFrameComponent, NzTabsModule],
  providers: [{ provide: DocumentState, useExisting: ThemeStore }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 0; }
    .center { display: flex; flex-direction: column; min-height: 0; }
    .center nz-tabs { padding: 0 12px; background: var(--lc-color-surface); }
    .center ::ng-deep .ant-tabs-nav { margin: 0; }
    .view { flex: 1; min-height: 0; }
    .off { display: none; }
    .right { overflow: auto; padding: 12px; background: var(--lc-color-surface); border-left: 1px solid var(--lc-color-border); }
    .panel-title { margin: 0 0 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--lc-color-muted); }
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
    <aside class="right">
      <h2 class="panel-title">{{ i18n.t('ed.inspector') }}</h2>
      <p class="note">{{ i18n.t('ed.theme.note') }}</p>
      <ed-fields [path]="[]" [fields]="fields" />
    </aside>
  `,
})
export class ThemeEditorComponent {
  protected readonly store = inject(ThemeStore);
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
    }),
  );
}
