import { Injectable, computed, inject } from '@angular/core';
import { joinUrl, splitReference, type DataSourceDefinition } from 'schema';
import { setIn, type Json, type JsonObject } from './doc-ops';
import { DataSourcesStore } from './datasources-store';
import { Project, resourcePath } from './project';
import { Workspace } from './workspace';

/**
 * The data sources of the project as the «Data sources» panel of a screen offers them: the references that can be chosen
 * and the move of a data source written in the screen into a data sources document of the project.
 */
@Injectable({ providedIn: 'root' })
export class ProjectDataSources {
  private readonly workspace = inject(Workspace);
  private readonly project = inject(Project);

  /** Every data source of the project, as a reference (`orders/list`), sorted. */
  readonly references = computed(() =>
    Object.entries(this.workspace.dataSources())
      .flatMap(([document, definition]) => Object.keys(definition.sources).map((name) => `${document}/${name}`))
      .sort(),
  );

  /** Identifiers of the data sources documents of the project. */
  readonly documents = computed(() => Object.keys(this.workspace.dataSources()).sort());

  /** The definition a reference points to (its url with the base address of the document in front), or null. */
  definition(ref: string): DataSourceDefinition | null {
    const [document, name] = splitReference(ref);
    const doc = this.workspace.dataSources()[document];
    const source = doc?.sources[name];
    return source ? { ...source, url: joinUrl(doc.baseUrl, source.url) } : null;
  }

  /**
   * Puts a data source in a data sources document of the project (created if missing), under `name`. If the document is
   * open in a window the change goes there, to be saved with it; otherwise the file is written at once.
   */
  async add(document: string, name: string, definition: DataSourceDefinition): Promise<void> {
    const path = resourcePath('datasources', document);
    const open = this.workspace.windowOf(path);
    if (open) {
      const store = open.injector.get(DataSourcesStore);
      store.apply(setIn(store.doc(), ['sources', name], definition as unknown as Json));
      return;
    }
    const current: JsonObject = this.project.has('datasources', document)
      ? ((await this.project.read(path)) as JsonObject)
      : { schemaVersion: '1.0', datasources: document, sources: {} };
    await this.project.write({ kind: 'datasources', id: document, path }, setIn(current, ['sources', name], definition as unknown as Json));
  }
}
