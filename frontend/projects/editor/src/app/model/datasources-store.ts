import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { checkScreenExpressions } from 'core';
import { ExpressionEngine } from 'expressions';
import { type DataSourcesDefinition } from 'schema';
import { validateDataSources } from 'schema/validation';
import { getIn, isObject, setIn, type Json, type JsonObject, type Path } from './doc-ops';
import { DOCUMENT_ID, DocumentState, readDraft, writeDraft, type EditorIssue } from './document-state';

/** Name of a data source: it is written in references, expressions and steps, so a simple identifier. */
export const SOURCE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * The list of data sources of a document, as the «Data sources» panel edits it: the data sources of a screen (`dataSources`)
 * or those of a data sources document of the project (`sources`), with their sample data for the previews.
 */
export abstract class DataSourceList {
  /** Where the data sources are in the document. */
  abstract readonly listPath: Path;
  /** Sample data by data source name, used by the previews instead of the services. */
  abstract readonly samples: () => Record<string, Json>;
  /** Names of the data sources of the document. */
  abstract readonly sourceNames: () => string[];
  /**
   * Adds a data source with a free name and returns it: in a data sources document a GET to define; in a screen a reference
   * to a data source of the project (null if the project has none).
   */
  abstract addSource(): string | null;
  /** Renames a data source (false if the name is not valid or already used). */
  abstract renameSource(from: string, to: string): boolean;
  abstract removeSource(name: string): void;
  abstract setSample(source: string, value: Json | undefined): void;
}

/** A new data sources document. */
export function emptyDataSources(id = 'new-data-sources'): JsonObject {
  return { schemaVersion: '1.0', datasources: id, sources: { list: { type: 'rest', method: 'GET', url: '/api/list' } } };
}

interface Draft {
  doc: Json;
  samples: Record<string, Json>;
}

/**
 * A data sources document of the project as an editor document: the data sources shared by the screens (they refer to them
 * with `{ "ref": "<document>/<name>" }`), with sample data for the previews kept in the draft. One store per window.
 */
@Injectable()
export class DataSourcesStore extends DocumentState implements DataSourceList {
  private readonly id = inject(DOCUMENT_ID);
  private readonly engine = new ExpressionEngine({ can: () => true });
  readonly listPath: Path = ['sources'];
  readonly samples = signal<Record<string, Json>>({});
  /** The document as a valid definition, or null if it has errors. */
  readonly definition = computed<DataSourcesDefinition | null>(() => (this.errorCount() === 0 ? (this.doc() as unknown as DataSourcesDefinition) : null));
  readonly sourceNames = computed(() => {
    const sources = getIn(this.doc(), ['sources']);
    return isObject(sources) ? Object.keys(sources) : [];
  });

  constructor() {
    super();
    const draft = readDraft(this.id);
    const saved = isObject(draft as Json) ? (draft as unknown as Draft) : null;
    this.doc.set(saved && isObject(saved.doc) ? saved.doc : emptyDataSources());
    if (saved && isObject(saved.samples as Json)) this.samples.set(saved.samples);
    effect(() => writeDraft(this.id, { doc: this.doc(), samples: this.samples() } satisfies Draft));
  }

  protected selectable(_doc: Json, path: Path): boolean {
    return path.length === 0;
  }

  ownerOf(): Path {
    return [];
  }

  override load(doc: Json): void {
    this.reset(doc);
    this.samples.set({});
  }

  addSource(): string {
    const names = new Set(this.sourceNames());
    let name = 'data';
    for (let n = 2; names.has(name); n++) name = `data${n}`;
    this.apply(setIn(this.doc(), ['sources', name], { type: 'rest', method: 'GET', url: `/api/${name}` }));
    return name;
  }

  renameSource(from: string, to: string): boolean {
    if (from === to) return true;
    if (!SOURCE_NAME.test(to) || this.sourceNames().includes(to)) return false;
    const sources = getIn(this.doc(), ['sources']) as JsonObject;
    const renamed = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k === from ? to : k, v]));
    this.apply(setIn(this.doc(), ['sources'], renamed));
    const sample = this.samples()[from];
    if (sample !== undefined) {
      this.setSample(from, undefined);
      this.setSample(to, sample);
    }
    return true;
  }

  removeSource(name: string): void {
    this.apply(setIn(this.doc(), ['sources', name], undefined));
    this.setSample(name, undefined);
  }

  /**
   * Adds several data sources in a single step to undo (import from OpenAPI). Names already in use are not overwritten;
   * sample data are set only for the new data sources. Returns the names added.
   */
  importSources(entries: { name: string; source: JsonObject; sample?: Json }[]): string[] {
    const existing = new Set(this.sourceNames());
    const fresh = entries.filter((e) => SOURCE_NAME.test(e.name) && !existing.has(e.name));
    if (!fresh.length) return [];
    let next = this.doc();
    for (const entry of fresh) next = setIn(next, ['sources', entry.name], entry.source);
    this.apply(next);
    for (const entry of fresh) if (entry.sample !== undefined) this.setSample(entry.name, entry.sample);
    return fresh.map((e) => e.name);
  }

  setSample(source: string, value: Json | undefined): void {
    this.samples.update((all) => {
      const next = { ...all };
      if (value === undefined) delete next[source];
      else next[source] = value;
      return next;
    });
  }

  protected check(doc: Json): EditorIssue[] {
    const issues: EditorIssue[] = [];
    const result = validateDataSources(doc);
    if (!result.valid) result.issues.forEach((i) => issues.push({ owner: [], pointer: i.path, message: i.message, severity: 'error' }));
    // The expressions of the data sources (URL, parameters, body) are checked as those of a screen.
    checkScreenExpressions(doc, this.engine).forEach((p) => issues.push({ owner: [], pointer: p.path, message: p.message, severity: 'error' }));
    return issues;
  }
}
