import { InjectionToken, type Provider, type Type } from '@angular/core';

/**
 * Catalogo dei componenti: associa il `type` di un nodo al componente Angular che lo disegna.
 * Ogni componente del catalogo deve avere tre input: `node`, `runtime` e `scope`.
 */
export type ComponentCatalog = Record<string, Type<unknown>>;

export const COMPONENT_CATALOG = new InjectionToken<ComponentCatalog>('COMPONENT_CATALOG');

export function provideComponentCatalog(catalog: ComponentCatalog): Provider {
  return { provide: COMPONENT_CATALOG, useValue: catalog };
}
