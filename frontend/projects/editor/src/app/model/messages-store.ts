import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { I18n } from 'core';
import { validateMessages } from 'schema';
import { isObject, toPointer, type Json, type Path } from './doc-ops';
import { DOCUMENT_ID, DocumentState, readDraft, writeDraft, type EditorIssue } from './document-state';
import { KnownTranslations } from './shared-state';

/**
 * A translation catalogue of the project (`i18n/<language>.json`: key → text, the format the runtime demo reads) as an editor
 * document. Besides the rules of the catalogues (keys, plain texts) it warns about the keys of the default language that
 * have no text here. One store per window.
 */
@Injectable()
export class MessagesStore extends DocumentState {
  private readonly id = inject(DOCUMENT_ID);
  private readonly i18n = inject(I18n);
  private readonly known = inject(KnownTranslations);
  /** The keys of the catalogue, sorted. */
  readonly keys = computed(() => {
    const doc = this.doc();
    return isObject(doc) ? Object.keys(doc).sort() : [];
  });

  constructor() {
    super();
    const draft = readDraft(this.id);
    this.doc.set(isObject(draft as Json) ? (draft as Json) : {});
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

  /** Language of the catalogue (from its file, set by the workspace). */
  readonly language = signal('');

  protected check(doc: Json): EditorIssue[] {
    const result = validateMessages({ schemaVersion: '1.0', messages: 'en', texts: doc });
    const issues: EditorIssue[] = result.valid
      ? []
      : result.issues.map((i) => ({ owner: [], pointer: i.path.replace(/^\/texts/, '') || '/', message: i.message, severity: 'error' as const }));
    const project = this.known.project();
    if (project && isObject(doc) && this.language() && this.language() !== project.defaultLanguage) {
      for (const key of Object.keys(project.catalogues[project.defaultLanguage] ?? {})) {
        if (typeof doc[key] !== 'string' || doc[key] === '') {
          issues.push({ owner: [], pointer: toPointer([key]), message: this.i18n.t('ed.messages.missing', { key }), severity: 'warning' });
        }
      }
    }
    return issues;
  }
}
