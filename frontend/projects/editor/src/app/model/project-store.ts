import { Injectable, effect, inject } from '@angular/core';
import { I18n } from 'core';
import { PROJECT_SCHEMA, validateProject } from 'schema';
import { isObject, type Json, type Path } from './doc-ops';
import { DOCUMENT_ID, DocumentState, readDraft, writeDraft, type EditorIssue } from './document-state';
import { Project } from './project';
import { SchemaReader, type Schema } from './schema-info';

export const PROJECT = new SchemaReader(PROJECT_SCHEMA as unknown as Schema);

/**
 * The manifest of the project (project.json) as an editor document: name, languages, default language, themes. Besides the
 * schema it checks that the default language is among the languages and that the themes listed are in the project.
 */
@Injectable()
export class ProjectStore extends DocumentState {
  private readonly id = inject(DOCUMENT_ID);
  private readonly project = inject(Project);
  private readonly i18n = inject(I18n);

  constructor() {
    super();
    const draft = readDraft(this.id);
    this.doc.set(isObject(draft as Json) ? (draft as Json) : ((this.project.manifest() ?? {}) as unknown as Json));
    effect(() => writeDraft(this.id, this.doc()));
  }

  protected selectable(_doc: Json, path: Path): boolean {
    return path.length === 0;
  }

  ownerOf(): Path {
    return [];
  }

  override load(doc: Json): void {
    this.reset(doc);
  }

  override suggestions(property: string): string[] {
    const doc = this.doc();
    if (property === 'defaultLanguage' && isObject(doc) && Array.isArray(doc['languages'])) {
      return doc['languages'].filter((l): l is string => typeof l === 'string');
    }
    return [];
  }

  protected check(doc: Json): EditorIssue[] {
    const result = validateProject(doc);
    if (!result.valid) return result.issues.map((i) => ({ owner: [], pointer: i.path, message: i.message, severity: 'error' as const }));
    const issues: EditorIssue[] = [];
    const manifest = result.value;
    if (!manifest.languages.includes(manifest.defaultLanguage)) {
      issues.push({ owner: [], pointer: '/defaultLanguage', message: this.i18n.t('ed.project.defaultNotListed', { language: manifest.defaultLanguage }), severity: 'error' });
    }
    (manifest.themes ?? []).forEach((theme, i) => {
      if (!this.project.has('theme', theme)) issues.push({ owner: [], pointer: `/themes/${i}`, message: this.i18n.t('ed.project.unknownTheme', { theme }), severity: 'warning' });
    });
    return issues;
  }
}
