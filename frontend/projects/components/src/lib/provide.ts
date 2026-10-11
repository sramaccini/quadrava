import { effect, importProvidersFrom, inject, provideEnvironmentInitializer, type EnvironmentProviders, type Provider } from '@angular/core';
import { Confirmation, FormDialog, I18n, provideComponentCatalog, type ComponentCatalog } from 'core';
import { enGB as dateEnglish, it as dateItalian, type Locale } from 'date-fns/locale';
import { NzDateAdapter, provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { en_GB, it_IT, NzI18nService, provideNzI18n, type NzI18nInterface } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { BUILTIN_MESSAGES } from './messages';
import { AlertComponent } from './alert.component';
import { ButtonComponent } from './button.component';
import { DetailComponent } from './detail.component';
import { DialogConfirmation } from './dialog-confirmation';
import { DialogForm } from './dialog-form';
import { FilterBarComponent } from './filter-bar.component';
import { FormComponent } from './form.component';
import { ICON_TYPES } from './icon.component';
import { SectionComponent } from './section.component';
import { StatsComponent } from './stats.component';
import { TreeComponent } from './tree.component';
import { WizardComponent } from './wizard.component';
import { TableComponent } from './table.component';
import { TabsComponent } from './tabs.component';
import { TextComponent } from './text.component';
import { provideNzThemeBridge } from './theme-bridge';

/** Italiano di NG-ZORRO completato con le voci che la libreria non traduce (altrimenti avvisa in console a ogni selettore di date). */
const ITALIAN: NzI18nInterface = {
  ...it_IT,
  DatePicker: {
    ...it_IT.DatePicker,
    lang: { ...it_IT.DatePicker.lang, rangeQuarterPlaceholder: ['Trimestre iniziale', 'Trimestre finale'] },
  },
};

/** Inglese di NG-ZORRO completato con la stessa voce mancante. */
const ENGLISH: NzI18nInterface = {
  ...en_GB,
  DatePicker: {
    ...en_GB.DatePicker,
    lang: { ...en_GB.DatePicker.lang, rangeQuarterPlaceholder: ['Start quarter', 'End quarter'] },
  },
};

/** Nomi di mesi e giorni nei selettori di date (date-fns) per ogni lingua; una lingua senza voce usa l'inglese. */
const DATE_LOCALES: Record<string, Locale> = { it: dateItalian, en: dateEnglish };

/** Lingua di NG-ZORRO per ogni lingua dell'applicazione; una lingua senza voce usa l'inglese. */
const NZ_LOCALES: Record<string, NzI18nInterface> = { it: ITALIAN, en: ENGLISH };

/** Catalogo standard. Le applicazioni possono aggiungere o sostituire componenti passando `extra`. */
export const STANDARD_COMPONENTS: ComponentCatalog = {
  section: SectionComponent,
  text: TextComponent,
  button: ButtonComponent,
  filterBar: FilterBarComponent,
  table: TableComponent,
  form: FormComponent,
  tabs: TabsComponent,
  detail: DetailComponent,
  alert: AlertComponent,
  stats: StatsComponent,
  wizard: WizardComponent,
  tree: TreeComponent,
};

/**
 * Catalogo standard e tutto ciò che NG-ZORRO richiede per funzionare: icone del set integrato, lingua italiana,
 * adattatore delle date (date-fns), ponte tra il tema della piattaforma e quello di NG-ZORRO e finestra di conferma.
 * La lingua di NG-ZORRO e le scritte `lc.*` seguono la lingua attiva del servizio `I18n` (italiano e inglese di serie).
 * Per cambiare la conferma si fornisce `Confirmation` dopo questa chiamata.
 */
export function provideLowcodeComponents(extra: ComponentCatalog = {}): (Provider | EnvironmentProviders)[] {
  return [
    provideComponentCatalog({ ...STANDARD_COMPONENTS, ...extra }),
    { provide: Confirmation, useExisting: DialogConfirmation },
    { provide: FormDialog, useExisting: DialogForm },
    provideNzIcons(Object.values(ICON_TYPES).map((i) => i.icon)),
    provideNzI18n(ITALIAN),
    provideNzDateFnsAdapter(),
    importProvidersFrom(NzModalModule),
    provideNzThemeBridge(),
    provideEnvironmentInitializer(() => {
      const i18n = inject(I18n);
      const nz = inject(NzI18nService);
      const dates = inject(NzDateAdapter);
      for (const [locale, messages] of Object.entries(BUILTIN_MESSAGES)) i18n.addMessages(locale, messages, 'builtin');
      effect(() => {
        nz.setLocale(NZ_LOCALES[i18n.locale()] ?? ENGLISH);
        dates.setLocale(DATE_LOCALES[i18n.locale()] ?? dateEnglish);
      });
    }),
  ];
}

