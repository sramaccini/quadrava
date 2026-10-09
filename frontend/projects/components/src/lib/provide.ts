import { importProvidersFrom, type EnvironmentProviders, type Provider } from '@angular/core';
import { Confirmation, provideComponentCatalog, type ComponentCatalog } from 'core';
import { provideNzDateFnsAdapter } from 'ng-zorro-antd/core/time';
import { it_IT, provideNzI18n, type NzI18nInterface } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { AlertComponent } from './alert.component';
import { ButtonComponent } from './button.component';
import { DetailComponent } from './detail.component';
import { DialogConfirmation } from './dialog-confirmation';
import { FilterBarComponent } from './filter-bar.component';
import { FormComponent } from './form.component';
import { ICON_TYPES } from './icon.component';
import { SectionComponent } from './section.component';
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
};

/**
 * Catalogo standard e tutto ciò che NG-ZORRO richiede per funzionare: icone del set integrato, lingua italiana,
 * adattatore delle date (date-fns), ponte tra il tema della piattaforma e quello di NG-ZORRO e finestra di conferma.
 * Per cambiare lingua o conferma si forniscono `NZ_I18N` o `Confirmation` dopo questa chiamata.
 */
export function provideLowcodeComponents(extra: ComponentCatalog = {}): (Provider | EnvironmentProviders)[] {
  return [
    provideComponentCatalog({ ...STANDARD_COMPONENTS, ...extra }),
    { provide: Confirmation, useExisting: DialogConfirmation },
    provideNzIcons(Object.values(ICON_TYPES).map((i) => i.icon)),
    provideNzI18n(ITALIAN),
    provideNzDateFnsAdapter(),
    importProvidersFrom(NzModalModule),
    provideNzThemeBridge(),
  ];
}

