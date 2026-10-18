import { referencedDocuments, resolveDataSources, validateDataSources, type DataSourcesDefinition, type ResolutionIssue, type ScreenDefinition } from 'schema';
import type { DefinitionSource } from './ports';

/**
 * The screen with the references to the data sources of the application resolved: the documents referred to are loaded
 * from the definition source (once each) and validated. A document that cannot be loaded or is not valid counts as missing:
 * its references are left out with a problem (fail-closed, see `resolveDataSources`); the screen still opens.
 */
export async function loadDataSources(screen: ScreenDefinition, source: DefinitionSource): Promise<{ screen: ScreenDefinition; issues: ResolutionIssue[] }> {
  const ids = referencedDocuments(screen);
  if (!ids.length) return { screen, issues: [] };
  const issues: ResolutionIssue[] = [];
  const documents: Record<string, DataSourcesDefinition | undefined> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const result = validateDataSources(await source.dataSources(id));
        if (result.valid) documents[id] = result.value;
        else issues.push({ path: `datasources/${id}`, message: result.issues.map((i) => `${i.path} ${i.message}`).join('; ') });
      } catch (e) {
        issues.push({ path: `datasources/${id}`, message: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  const resolved = resolveDataSources(screen, documents);
  return { screen: resolved.screen, issues: [...issues, ...resolved.issues] };
}
