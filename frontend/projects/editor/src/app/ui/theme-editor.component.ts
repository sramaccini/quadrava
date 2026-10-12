import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { SidebarComponent, themeToNzVars } from 'components';
import { I18n, NavigationRuntime, ScreenComponent, themeToCssVars } from 'core';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import type { ThemeDefinition } from 'schema';
import { DocumentState } from '../model/document-state';
import { EditorStore } from '../model/editor-store';
import { NavigationStore } from '../model/navigation-store';
import { THEME, ThemeStore } from '../model/theme-store';
import { FieldsComponent } from './fields.component';
import { JsonViewComponent } from './json-view.component';

/**
 * Editor del tema: a destra i token (colori, tipografia, forma, densità, layout) generati dallo schema dei temi, al
 * centro la schermata e il menu che si stanno modificando, disegnati con il tema. Le variabili del tema valgono solo
 * dentro l'anteprima, così l'editor resta leggibile qualunque tema si stia provando.
 */
@Component({
  selector: 'ed-theme-editor',
  imports: [FieldsComponent, JsonViewComponent, ScreenComponent, SidebarComponent, NzTabsModule],
  providers: [{ provide: DocumentState, useExisting: ThemeStore }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 0; }
    .center { display: flex; flex-direction: column; min-height: 0; }
    .center nz-tabs { padding: 0 12px; background: var(--lc-color-surface); }
    .center ::ng-deep .ant-tabs-nav { margin: 0; }
    .view { flex: 1; min-height: 0; }
    .right { overflow: auto; padding: 12px; background: var(--lc-color-surface); border-left: 1px solid var(--lc-color-border); }
    .panel-title { margin: 0 0 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--lc-color-muted); }
    .frame {
      display: flex; height: 100%; overflow: auto; background: var(--lc-color-background); color: var(--lc-color-on-surface);
      font-family: var(--lc-font-family); font-size: var(--lc-font-size);
    }
    .frame > main { flex: 1; min-width: 0; }
    .empty { padding: 24px; color: var(--lc-color-muted); }
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
        } @else {
          <div #frame class="frame" [attr.aria-label]="i18n.t('ed.theme.preview')">
            @if (navigation(); as nav) {
              <lc-sidebar [navigation]="nav" brand="LowCode" [tone]="tone()" [useCaseId]="useCaseId()" (useCaseChange)="useCaseId.set($event)" />
            }
            <main>
              @if (screens.definition(); as definition) {
                <lc-screen [definition]="definition" />
              } @else {
                <p class="empty">{{ i18n.t('ed.preview.empty') }}</p>
              }
            </main>
          </div>
        }
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
  protected readonly screens = inject(EditorStore);
  private readonly menus = inject(NavigationStore);
  protected readonly i18n = inject(I18n);
  protected readonly fields = THEME.rootProperties();
  protected readonly view = signal<'preview' | 'json'>('preview');
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');

  /** L'ultimo tema valido: con errori l'anteprima non cambia. */
  private readonly theme = linkedSignal<ThemeDefinition | null, ThemeDefinition | null>({
    source: () => this.store.definition(),
    computation: (next, previous) => next ?? previous?.value ?? null,
  });
  protected readonly tone = computed(() => {
    const theme = this.theme();
    return theme?.tokens.layout?.sider?.tone ?? (theme?.mode === 'dark' ? 'dark' : 'light');
  });

  /** Il menu della navigazione che si sta modificando, con tutti i permessi. */
  protected readonly navigation = computed(() => {
    const definition = this.menus.definition();
    return definition
      ? new NavigationRuntime(definition, {
          authorization: { can: () => true },
          userProvider: { user: () => ({ username: 'anteprima', locale: this.i18n.locale() }) },
          i18n: this.i18n,
        })
      : null;
  });
  protected readonly useCaseId = linkedSignal(() => this.navigation()?.useCases()[0]?.id ?? null);

  constructor() {
    // Variabili del tema (della piattaforma e di NG-ZORRO) solo sul riquadro dell'anteprima.
    let applied: string[] = [];
    effect(() => {
      const frame = this.frame()?.nativeElement;
      const theme = this.theme();
      if (!frame) return;
      applied.forEach((name) => frame.style.removeProperty(name));
      applied = [];
      if (!theme) return;
      const vars = { ...themeToCssVars(theme), ...themeToNzVars(theme) };
      for (const [name, value] of Object.entries(vars)) {
        frame.style.setProperty(name, value);
        applied.push(name);
      }
      frame.style.setProperty('color-scheme', theme.mode ?? 'light');
      applied.push('color-scheme');
    });
  }
}
