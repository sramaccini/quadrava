import type { ExpressionEngine } from 'expressions';
import type { NavigationDefinition, NavigationItem } from 'schema';
import { checkScreenExpressions } from './expression-check';

export interface NavigationIssue {
  path: string;
  message: string;
}

/**
 * Controlli di coerenza che lo schema non può fare: identificativi univoci, `default` esistente,
 * schermate esistenti (se si passa l'elenco di quelle pubblicate) ed espressioni `visibleIf` valide.
 * Si usa all'avvio e nell'editor; non esegue nulla.
 */
export function checkNavigation(definition: NavigationDefinition, engine: ExpressionEngine, knownScreens?: ReadonlySet<string>): NavigationIssue[] {
  const issues: NavigationIssue[] = [];
  const seen = new Map<string, string>();

  const claim = (id: string, path: string): void => {
    const previous = seen.get(id);
    if (previous) issues.push({ path, message: `identificativo duplicato "${id}" (già usato in ${previous})` });
    else seen.set(id, path);
  };

  const walk = (items: NavigationItem[], path: string): void => {
    items.forEach((item, i) => {
      const here = `${path}/${i}`;
      claim(item.id, here);
      if ('children' in item) {
        walk(item.children, `${here}/children`);
      } else if (knownScreens && !knownScreens.has(item.screen)) {
        issues.push({ path: `${here}/screen`, message: `schermata inesistente "${item.screen}"` });
      }
    });
  };

  definition.areas.forEach((area, i) => {
    const here = `/areas/${i}`;
    claim(area.id, here);
    walk(area.items, `${here}/items`);
  });

  if (definition.default && !definition.areas.some((u) => u.id === definition.default)) {
    issues.push({ path: '/default', message: `area predefinita inesistente "${definition.default}"` });
  }

  for (const issue of checkScreenExpressions(definition, engine)) {
    issues.push({ path: issue.path, message: `espressione non valida: ${issue.message}` });
  }
  return issues;
}
