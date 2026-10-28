import { DefinitionSource } from './ports';

/**
 * Link between Quadrava Studio and a runtime opened by its «Run project» command (ADR-16). The runtime starts with
 * `?studio=<origin of Studio>`, asks the window that opened it for the project and serves it from memory. Only
 * definitions travel, as JSON, between the two windows and their declared origins.
 */

/** URL parameter with the origin of the Studio that opened the runtime. */
export const STUDIO_QUERY = 'studio';

/**
 * Name of the channel between Studio and the runtime when they are on the same origin, as in the desktop app (ADR-17): there
 * the runtime opens in a window of the app without `window.opener`, and the two talk on a `BroadcastChannel`, which the
 * browser keeps to the windows of that origin.
 */
export const STUDIO_CHANNEL = 'quadrava-studio';

/** The project as Studio sees it: its files, with the documents open in the windows in their place. */
export interface ProjectSnapshot {
  /** project.json: name, languages, default language, themes. */
  readonly manifest: unknown;
  readonly navigation: unknown;
  /** By identifier. */
  readonly screens: Readonly<Record<string, unknown>>;
  readonly dataSources: Readonly<Record<string, unknown>>;
  readonly themes: Readonly<Record<string, unknown>>;
  /** Translation catalogues by language (key → text). */
  readonly messages: Readonly<Record<string, unknown>>;
}

export type FromRuntime = { type: 'lc-studio:ready' };
export type FromStudio = { type: 'lc-studio:project'; project: ProjectSnapshot } | { type: 'lc-studio:reload' };

/** At most this many resources of each kind, and this many characters of JSON in all: a snapshot is definitions, not data. */
const MAX_RESOURCES = 500;
const MAX_SIZE = 20_000_000;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGUAGE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resources(value: unknown, key: RegExp): boolean {
  return isRecord(value) && Object.keys(value).length <= MAX_RESOURCES && Object.keys(value).every((k) => key.test(k));
}

/** A snapshot in its expected shape (identifiers, languages, size). The documents themselves are validated by the runtime. */
export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  if (!isRecord(value)) return false;
  const { screens, dataSources, themes, messages } = value;
  if (!resources(screens, ID) || !resources(dataSources, ID) || !resources(themes, ID) || !resources(messages, LANGUAGE)) return false;
  try {
    return JSON.stringify(value).length <= MAX_SIZE;
  } catch {
    return false;
  }
}

export function isFromStudio(data: unknown): data is FromStudio {
  if (!isRecord(data)) return false;
  if (data['type'] === 'lc-studio:reload') return true;
  return data['type'] === 'lc-studio:project' && isProjectSnapshot(data['project']);
}

export function isFromRuntime(data: unknown): data is FromRuntime {
  return isRecord(data) && data['type'] === 'lc-studio:ready';
}

/** A document not in the snapshot: as a 404 of another source, so the runtime says «screen not found». */
function missing(what: string): Error {
  return Object.assign(new Error(`${what} is not in the project`), { status: 404 });
}

/**
 * The definitions of a project snapshot, from memory. Every read returns a copy: the runtime can never change the snapshot.
 */
export class SnapshotDefinitions extends DefinitionSource {
  constructor(
    private readonly project: ProjectSnapshot,
    /** Themes the user can choose (from the manifest; all those of the snapshot if it lists none). */
    private readonly themeIds: readonly string[] = Object.keys(project.themes),
  ) {
    super();
  }

  private read(table: Readonly<Record<string, unknown>>, id: string, what: string): Promise<unknown> {
    return Object.prototype.hasOwnProperty.call(table, id) ? Promise.resolve(structuredClone(table[id])) : Promise.reject(missing(what));
  }

  screen(id: string): Promise<unknown> {
    return this.read(this.project.screens, id, `screen ${id}`);
  }

  dataSources(id: string): Promise<unknown> {
    return this.read(this.project.dataSources, id, `data sources ${id}`);
  }

  navigation(): Promise<unknown> {
    return this.project.navigation === null || this.project.navigation === undefined ? Promise.reject(missing('navigation')) : Promise.resolve(structuredClone(this.project.navigation));
  }

  theme(id: string): Promise<unknown> {
    return this.read(this.project.themes, id, `theme ${id}`);
  }

  themes(): string[] {
    return [...this.themeIds];
  }

  messages(locale: string): Promise<unknown> {
    return this.read(this.project.messages, locale, `catalogue ${locale}`);
  }
}
