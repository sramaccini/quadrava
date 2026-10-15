import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { IconComponent, QuadravaWordmarkComponent, SidebarComponent, UserMenuComponent, type UserMenuItem } from 'components';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { DefinitionSource, I18n, ThemeService, loadCatalogs, type VisibleLeaf } from 'core';
import { validateTheme } from 'schema';
import { NavigationService } from './navigation.service';
import { ShellSession } from './shell-session';
import { DemoNetwork, NETWORK_SPEEDS, type NetworkSpeed } from '../demo/demo-ports';

/** Lingue della demo: per ciascuna esiste `examples/i18n/<lingua>.json`. */
const LANGUAGES = ['it', 'en'];

const LANGUAGE_KEY = 'lc.language';

/**
 * Fasce di larghezza del guscio, come in Ant Design Pro:
 * - wide (≥ 1200px): barra laterale espansa, impostazioni della demo nella barra superiore;
 * - medium (768–1199px): barra laterale compressa a icone (si può espandere), impostazioni in un menu;
 * - narrow (< 768px): barra laterale in un cassetto aperto dal pulsante «menu», impostazioni in un menu.
 */
export type Viewport = 'wide' | 'medium' | 'narrow';
const WIDE = '(min-width: 1200px)';
const MEDIUM = '(min-width: 768px)';

/** Fascia corrente, aggiornata quando la finestra cambia dimensione. Senza matchMedia (test, server) vale `wide`. */
function viewportSignal(destroyRef: DestroyRef) {
  const current = signal<Viewport>('wide');
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return current.asReadonly();
  const wide = window.matchMedia(WIDE);
  const medium = window.matchMedia(MEDIUM);
  const update = () => current.set(wide.matches ? 'wide' : medium.matches ? 'medium' : 'narrow');
  update();
  wide.addEventListener('change', update);
  medium.addEventListener('change', update);
  destroyRef.onDestroy(() => {
    wide.removeEventListener('change', update);
    medium.removeEventListener('change', update);
  });
  return current.asReadonly();
}

/** Lingua iniziale: l'ultima scelta, altrimenti quella del browser se supportata, altrimenti l'italiano. */
function initialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && LANGUAGES.includes(stored)) return stored;
  } catch {
    // vedi sopra
  }
  const browser = (typeof navigator === 'undefined' ? '' : navigator.language).slice(0, 2);
  return LANGUAGES.includes(browser) ? browser : 'it';
}

/** Guscio dell'applicazione: barra superiore (profilo e tema della demo), menu laterale, contenuto e notifiche. */
@Component({
  selector: 'lc-root',
  imports: [FormsModule, NgTemplateOutlet, RouterOutlet, IconComponent, QuadravaWordmarkComponent, SidebarComponent, UserMenuComponent, NzButtonModule, NzDrawerModule, NzDropdownModule, NzLayoutModule, NzMenuModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(ShellSession);
  protected readonly navigation = inject(NavigationService);
  private readonly themeService = inject(ThemeService);
  protected readonly i18n = inject(I18n);
  protected readonly languages = LANGUAGES;

  protected readonly profiles = this.session.profiles;
  /** Rete simulata: solo nella demo con il backend nel browser (dove ci sono i profili da scegliere). */
  protected readonly network = inject(DemoNetwork);
  protected readonly speeds = Object.keys(NETWORK_SPEEDS) as NetworkSpeed[];
  private readonly definitions = inject(DefinitionSource);
  protected readonly themes = this.definitions.themes();
  protected readonly themeName = signal(this.themes[0]);
  protected readonly viewport = viewportSignal(inject(DestroyRef));
  protected readonly collapsed = signal(false);
  /** Cassetto con la barra laterale, solo nella fascia stretta. */
  protected readonly drawerOpen = signal(false);
  /** Voci del menu utente prima dell'uscita, che il componente aggiunge da sé come ultima. */
  protected readonly userItems = computed<UserMenuItem[]>(() => [{ id: 'permessi', label: this.i18n.t('app.permissions', { n: this.session.permissionCount() }), icon: 'safety', disabled: true }]);
  /** Stile del menu: lo dice il tema (barra laterale chiara o scura). */
  protected readonly siderTone = computed(() => {
    const theme = this.themeService.current();
    return theme?.tokens.layout?.sider?.tone ?? (theme?.mode === 'dark' ? 'dark' : 'light');
  });
  protected readonly active = computed(() => {
    const here = this.navigation.current();
    return here.screen ? { screen: here.screen, params: here.params } : null;
  });
  protected readonly hrefFor = (area: string, leaf: VisibleLeaf): string => this.navigation.href(area, leaf);

  constructor() {
    // I cataloghi vengono dalla stessa fonte delle definizioni: i file della demo oppure le versioni pubblicate nel registro.
    void loadCatalogs(this.i18n, LANGUAGES, (l) => this.definitions.messages(l)).then((problems) => problems.forEach((p) => console.warn('[i18n]', p)));
    this.i18n.setLocale(initialLanguage());
    effect(() => {
      const locale = this.i18n.locale();
      document.documentElement.lang = locale;
      try {
        localStorage.setItem(LANGUAGE_KEY, locale);
      } catch {
        // Archiviazione non disponibile (navigazione privata, blocchi): la scelta vale solo per questa sessione.
      }
    });
    // Al cambio di fascia la barra si adatta: compressa nella media, espansa nella larga, cassetto chiuso altrimenti.
    // Dentro la stessa fascia vale la scelta dell'utente.
    effect(() => {
      const viewport = this.viewport();
      untracked(() => {
        this.collapsed.set(viewport === 'medium');
        if (viewport !== 'narrow') this.drawerOpen.set(false);
      });
    });
    effect(() => {
      const name = this.themeName();
      this.definitions
        .theme(name)
        .then((doc: unknown) => {
          const result = validateTheme(doc);
          if (result.valid) this.themeService.apply(result.value);
        })
        .catch((e: unknown) => console.warn('[tema]', name, e instanceof Error ? e.message : e));
    });
  }

  /** Apre una voce del menu; nel cassetto lo chiude (il cambio di area invece lo lascia aperto per scegliere la voce). */
  protected open(area: string, leaf: VisibleLeaf): void {
    this.drawerOpen.set(false);
    this.navigation.open(area, leaf.screen, leaf.params);
  }
}
