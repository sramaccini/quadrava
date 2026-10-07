import type { Provider } from '@angular/core';
import { Confirmation, provideComponentCatalog, type ComponentCatalog } from 'core';
import { AlertComponent } from './alert.component';
import { DetailComponent } from './detail.component';
import { DialogConfirmation } from './dialog-confirmation';
import { TabsComponent } from './tabs.component';
import { ButtonComponent } from './button.component';
import { FilterBarComponent } from './filter-bar.component';
import { FormComponent } from './form.component';
import { SectionComponent } from './section.component';
import { TableComponent } from './table.component';
import { TextComponent } from './text.component';

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

/** Catalogo e finestra di conferma standard. Per cambiare la conferma si fornisce `Confirmation` dopo questa chiamata. */
export function provideLowcodeComponents(extra: ComponentCatalog = {}): Provider[] {
  return [provideComponentCatalog({ ...STANDARD_COMPONENTS, ...extra }), { provide: Confirmation, useExisting: DialogConfirmation }];
}
