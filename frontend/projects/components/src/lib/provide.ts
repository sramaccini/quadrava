import type { Provider } from '@angular/core';
import { provideComponentCatalog, type ComponentCatalog } from 'core';
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
};

export function provideLowcodeComponents(extra: ComponentCatalog = {}): Provider {
  return provideComponentCatalog({ ...STANDARD_COMPONENTS, ...extra });
}
