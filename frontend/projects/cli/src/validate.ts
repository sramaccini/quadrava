import { checkScreenExpressions } from '../../core/src/lib/expression-check';
import { ExpressionEngine } from '../../expressions/src/public-api';
import {
  validateDataSources,
  validateMessages,
  validateNavigation,
  validateProject as validateManifest,
  validateScreen,
  validateTheme,
  type ValidationResult,
} from '../../schema/validation/src/public-api';
import type { ProjectFile } from './project';

/** The kinds of document of a project; `messages` is a catalogue of `i18n/`, published as a messages document. */
export type Kind = 'project' | 'navigation' | 'screen' | 'datasources' | 'theme' | 'messages';

export interface ProjectDocument {
  kind: Kind;
  file: string;
  /** Identifier of the document (for a catalogue, its language). */
  id: string;
  doc: unknown;
}

export interface Issue {
  file: string;
  /** Position in the document (`/components/0/label`), when there is one. */
  path?: string;
  message: string;
}

const KIND_OF_FOLDER: Record<string, Kind> = { screens: 'screen', datasources: 'datasources', themes: 'theme', i18n: 'messages' };
const VALIDATORS: Record<Kind, (doc: unknown) => ValidationResult<unknown>> = {
  project: validateManifest,
  navigation: validateNavigation,
  screen: validateScreen,
  datasources: validateDataSources,
  theme: validateTheme,
  messages: validateMessages,
};
/** The property holding the identifier, which must be the name of the file. */
const IDENTIFIER: Partial<Record<Kind, string>> = { screen: 'screen', datasources: 'datasources', theme: 'theme' };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a project as the runtime and Studio would read it: every document against its schema, the identifiers against
 * the file names, the references to data sources, the patterns of the fields, the CEL expressions, the themes and the
 * languages of the manifest, and the translation catalogues (the same keys in every language, every `t('…')` known).
 * Returns the documents (for publishing) and the problems; it never throws.
 */
export function validateProject(files: ProjectFile[]): { documents: ProjectDocument[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const documents: ProjectDocument[] = [];

  for (const required of ['project.json', 'navigation.json']) {
    if (!files.some((f) => f.file === required)) issues.push({ file: required, message: 'missing' });
  }

  for (const { file, text } of files) {
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      issues.push({ file, message: `not valid JSON (${e instanceof Error ? e.message : e})` });
      continue;
    }
    const [folder, name] = file.includes('/') ? file.split('/') : ['', file];
    const kind: Kind = folder ? KIND_OF_FOLDER[folder] : file === 'project.json' ? 'project' : 'navigation';
    const base = name.replace(/\.json$/, '');
    if (kind === 'messages') {
      // The files of i18n/ are just key → text; the registry and the schema know them as messages documents.
      doc = { schemaVersion: '1.0', messages: base, texts: doc };
    }
    const result = VALIDATORS[kind](doc);
    if (!result.valid) {
      for (const issue of result.issues) issues.push({ file, path: issue.path || '/', message: issue.message });
      continue;
    }
    const key = IDENTIFIER[kind];
    const id = key ? String((doc as Json)[key]) : kind === 'navigation' ? String((doc as Json)['navigation']) : base;
    if (key && id !== base) issues.push({ file, message: `the identifier «${id}» is not the name of the file` });
    documents.push({ kind, file, id, doc });
  }

  checkReferences(documents, issues);
  checkPatterns(documents, issues);
  checkExpressions(documents, issues);
  checkManifest(documents, issues);
  checkCatalogues(documents, files, issues);
  return { documents, issues };
}

/** The references of the screens (`{ "ref": "orders/list" }`) resolve in the data sources documents of the project. */
function checkReferences(documents: ProjectDocument[], issues: Issue[]): void {
  const sources = new Map(documents.filter((d) => d.kind === 'datasources').map((d) => [d.id, ((d.doc as Json)['sources'] ?? {}) as Json]));
  for (const { file, doc } of documents.filter((d) => d.kind === 'screen')) {
    for (const [name, entry] of Object.entries(((doc as Json)['dataSources'] ?? {}) as Json)) {
      const ref = isObject(entry) ? entry['ref'] : undefined;
      if (typeof ref !== 'string') continue;
      const [document, source] = ref.split('/');
      if (!sources.get(document)?.[source]) issues.push({ file, path: `/dataSources/${name}`, message: `refers to ${ref}, which is not in datasources/` });
    }
  }
}

/**
 * The patterns of fields and validation rules compile as the runtime compiles them (Unicode, whole value, at most 500
 * characters): a broken one would make its field always invalid.
 */
function checkPatterns(documents: ProjectDocument[], issues: Issue[]): void {
  for (const { file, doc } of documents.filter((d) => d.kind === 'screen')) {
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}/${i}`));
      else if (isObject(value)) {
        for (const [key, v] of Object.entries(value)) {
          // messages.pattern is the text of the message, not an expression.
          if (key === 'messages') continue;
          if (key !== 'pattern' || typeof v !== 'string') walk(v, `${path}/${key}`);
          else {
            try {
              if (v.length > 500) throw new Error('longer than 500 characters');
              new RegExp(`^(?:${v})$`, 'u');
            } catch (e) {
              issues.push({ file, path: `${path}/pattern`, message: `not a valid regular expression (${e instanceof Error ? e.message : e})` });
            }
          }
        }
      }
    };
    walk(doc, '');
  }
}

/** The CEL expressions (`{{ … }}`) of screens, data sources and navigation compile, with the checks of Studio. */
function checkExpressions(documents: ProjectDocument[], issues: Issue[]): void {
  // Only compiling: no permission is ever asked.
  const engine = new ExpressionEngine({ can: () => false });
  for (const { file, doc, kind } of documents) {
    if (kind !== 'screen' && kind !== 'datasources' && kind !== 'navigation') continue;
    for (const issue of checkScreenExpressions(doc, engine)) issues.push({ file, path: issue.path, message: `expression ${issue.expression}: ${issue.message}` });
  }
}

/** The themes and the languages of the manifest exist in the project. */
function checkManifest(documents: ProjectDocument[], issues: Issue[]): void {
  const manifest = documents.find((d) => d.kind === 'project')?.doc as Json | undefined;
  if (!manifest) return;
  const has = (kind: Kind, id: string) => documents.some((d) => d.kind === kind && d.id === id);
  for (const theme of (manifest['themes'] ?? []) as string[]) {
    if (!has('theme', theme)) issues.push({ file: 'project.json', path: '/themes', message: `the theme ${theme} is not in themes/` });
  }
  for (const language of (manifest['languages'] ?? []) as string[]) {
    if (!has('messages', language)) issues.push({ file: 'project.json', path: '/languages', message: `the language ${language} has no catalogue in i18n/` });
  }
}

/** The same keys in every catalogue, and every key used with `t('…')` in the catalogue of the default language. */
function checkCatalogues(documents: ProjectDocument[], files: ProjectFile[], issues: Issue[]): void {
  const catalogues = documents.filter((d) => d.kind === 'messages');
  if (!catalogues.length) return;
  const manifest = documents.find((d) => d.kind === 'project')?.doc as Json | undefined;
  const defaultLanguage = String(manifest?.['defaultLanguage'] ?? 'en');
  const textsOf = (d: ProjectDocument) => (d.doc as { texts: Json }).texts;
  const reference = catalogues.find((d) => d.id === defaultLanguage);
  const base = new Set(Object.keys(reference ? textsOf(reference) : {}));
  for (const catalogue of catalogues) {
    const keys = new Set(Object.keys(textsOf(catalogue)));
    for (const key of base) if (!keys.has(key)) issues.push({ file: catalogue.file, message: `missing key ${key}` });
    for (const key of keys) if (!base.has(key)) issues.push({ file: catalogue.file, message: `key not in the default language (${defaultLanguage}): ${key}` });
  }
  for (const { file, text } of files) {
    if (file.startsWith('i18n/')) continue;
    const unknown = new Set([...text.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]).filter((key) => !base.has(key)));
    for (const key of unknown) issues.push({ file, message: `t('${key}') is not in the catalogue of the default language (${defaultLanguage})` });
  }
}
