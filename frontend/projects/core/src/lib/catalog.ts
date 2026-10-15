import { InjectionToken, type Provider, type Type } from '@angular/core';

/**
 * Component catalogue: maps the `type` of a node to the Angular component that draws it.
 * Every component of the catalogue must have three inputs: `node`, `runtime` and `scope`.
 */
export type ComponentCatalog = Record<string, Type<unknown>>;

export const COMPONENT_CATALOG = new InjectionToken<ComponentCatalog>('COMPONENT_CATALOG');

export function provideComponentCatalog(catalog: ComponentCatalog): Provider {
  return { provide: COMPONENT_CATALOG, useValue: catalog };
}
