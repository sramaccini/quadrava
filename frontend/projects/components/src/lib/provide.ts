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
import { CalendarComponent } from './calendar.component';
import { ChartComponent } from './chart.component';
import { DataTableComponent } from './data-table.component';
import { ServerDataTableComponent } from './server-data-table.component';
import { InputComponent } from './input.component';
import { BorderComponent, BoxComponent, GridComponent } from './layout.component';
import { ImageComponent, LinkComponent, ProgressComponent } from './display.component';
import { KanbanComponent } from './kanban.component';
import { TimelineComponent } from './timeline.component';
import { TreeComponent } from './tree.component';
import { WizardComponent } from './wizard.component';
import { TableComponent } from './table.component';
import { TabsComponent } from './tabs.component';
import { TextComponent } from './text.component';
import { provideNzThemeBridge } from './theme-bridge';

/** NG-ZORRO Italian completed with the entries the library does not translate (otherwise it warns in the console at every date picker). */
const ITALIAN: NzI18nInterface = {
  ...it_IT,
  DatePicker: {
    ...it_IT.DatePicker,
    lang: { ...it_IT.DatePicker.lang, rangeQuarterPlaceholder: ['Trimestre iniziale', 'Trimestre finale'] },
  },
};

/** NG-ZORRO English completed with the same missing entry. */
const ENGLISH: NzI18nInterface = {
  ...en_GB,
  DatePicker: {
    ...en_GB.DatePicker,
    lang: { ...en_GB.DatePicker.lang, rangeQuarterPlaceholder: ['Start quarter', 'End quarter'] },
  },
};

/** Month and day names in the date pickers (date-fns) for every language; a language without an entry uses English. */
const DATE_LOCALES: Record<string, Locale> = { it: dateItalian, en: dateEnglish };

/** NG-ZORRO language for every language of the application; a language without an entry uses English. */
const NZ_LOCALES: Record<string, NzI18nInterface> = { it: ITALIAN, en: ENGLISH };

/** Standard catalogue. Applications can add or replace components by passing `extra`. */
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
  calendar: CalendarComponent,
  chart: ChartComponent,
  dataTable: DataTableComponent,
  serverDataTable: ServerDataTableComponent,
  input: InputComponent,
  box: BoxComponent,
  grid: GridComponent,
  border: BorderComponent,
  image: ImageComponent,
  link: LinkComponent,
  progress: ProgressComponent,
  timeline: TimelineComponent,
  kanban: KanbanComponent,
};

/**
 * Standard catalogue and everything NG-ZORRO needs to work: icons of the built-in set, Italian language,
 * date adapter (date-fns), bridge between the platform theme and the NG-ZORRO one, and confirmation window.
 * The NG-ZORRO language and the `lc.*` texts follow the active language of the `I18n` service (Italian and English built in).
 * To change the confirmation, provide `Confirmation` after this call.
 */
export function provideLowcodeComponents(extra: ComponentCatalog = {}): (Provider | EnvironmentProviders)[] {
  return [
    provideComponentCatalog({ ...STANDARD_COMPONENTS, ...extra }),
    { provide: Confirmation, useExisting: DialogConfirmation },
    { provide: FormDialog, useExisting: DialogForm },
    provideNzIcons(Object.values(ICON_TYPES).map((i) => i.icon)),
    provideNzI18n(ENGLISH),
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

