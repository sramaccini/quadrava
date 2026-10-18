import { Injectable, computed, signal } from '@angular/core';
import { validateDataSources, validateProject, type DataSourcesDefinition, type ProjectDefinition } from 'schema';
import { isObject, type Json } from './doc-ops';
import type { ProjectFolder } from './project-folder';

/** Kinds of resource of a project: the manifest, screens, data sources, the navigation, themes, translation catalogues. */
export type ResourceKind = 'project' | 'screen' | 'datasources' | 'navigation' | 'theme' | 'messages';

/** A resource of the project: its kind, its identifier and the file that holds it. */
export interface ProjectResource {
  kind: ResourceKind;
  id: string;
  path: string;
}

export const MANIFEST_PATH = 'project.json';
export const NAVIGATION_PATH = 'navigation.json';
/** Folder of every kind of resource with one file per document. */
const FOLDERS: Partial<Record<ResourceKind, string>> = { screen: 'screens', datasources: 'datasources', theme: 'themes', messages: 'i18n' };
/** Identifier of a resource: kebab-case (a language code for the catalogues). */
export const RESOURCE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGUAGE_ID = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** The file of a resource: `screens/<id>.json`, `navigation.json`, `project.json`… */
export function resourcePath(kind: ResourceKind, id: string): string {
  if (kind === 'project') return MANIFEST_PATH;
  if (kind === 'navigation') return NAVIGATION_PATH;
  return `${FOLDERS[kind]}/${id}.json`;
}

/** The resource held by a file of the project, or null for a file that is not one (an index, a file elsewhere). */
export function resourceAt(path: string): ProjectResource | null {
  if (path === MANIFEST_PATH) return { kind: 'project', id: 'project', path };
  if (path === NAVIGATION_PATH) return { kind: 'navigation', id: 'navigation', path };
  const match = /^([a-z0-9]+)\/([A-Za-z0-9-]+)\.json$/.exec(path);
  if (!match) return null;
  const kind = (Object.keys(FOLDERS) as ResourceKind[]).find((k) => FOLDERS[k] === match[1]);
  if (!kind) return null;
  const valid = kind === 'messages' ? LANGUAGE_ID.test(match[2]) : RESOURCE_ID.test(match[2]);
  return valid ? { kind, id: match[2], path } : null;
}

/** The text of a resource file: indented JSON with a final new line, as in the repository. */
export function resourceText(doc: Json): string {
  return JSON.stringify(doc, null, 2) + '\n';
}

/** The starting manifest of a new project. */
export function newManifest(project: string, name: string): ProjectDefinition {
  return { schemaVersion: '1.0', project, name, languages: ['en'], defaultLanguage: 'en' };
}

/**
 * The open project: its folder, its manifest and the list of its resources. Studio always works inside a project: the
 * resources are opened, saved and deleted here, and the data sources documents saved in the project are kept at hand to
 * resolve the references of the screens (the windows add their unsaved changes, see `Workspace.dataSources`).
 */
@Injectable({ providedIn: 'root' })
export class Project {
  readonly folder = signal<ProjectFolder | null>(null);
  readonly manifest = signal<ProjectDefinition | null>(null);
  readonly resources = signal<ProjectResource[]>([]);
  /** Data sources documents saved in the project (the valid ones), by identifier. */
  readonly dataSources = signal<Record<string, DataSourcesDefinition>>({});
  readonly isOpen = computed(() => this.folder() !== null);
  /** Identity of the project in the browser storage (the windows of every project are remembered apart). */
  readonly key = computed(() => {
    const folder = this.folder();
    return folder ? `${folder.location}:${folder.name}` : null;
  });

  /** Opens the project in a folder: it must hold a valid project.json. Throws with a readable message otherwise. */
  async open(folder: ProjectFolder): Promise<void> {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await folder.read(MANIFEST_PATH));
    } catch {
      throw new Error('the folder has no project.json: it is not a Quadrava project');
    }
    const result = validateProject(manifest);
    if (!result.valid) throw new Error(`project.json is not valid: ${result.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
    this.folder.set(folder);
    this.manifest.set(result.value);
    await this.refresh();
  }

  /** Creates a project in an empty folder (or one without project.json): the manifest and an empty navigation. */
  async create(folder: ProjectFolder, manifest: ProjectDefinition, navigation: Json): Promise<void> {
    const files = await folder.list();
    if (files.includes(MANIFEST_PATH)) throw new Error('the folder already holds a project');
    await folder.write(MANIFEST_PATH, resourceText(manifest as unknown as Json));
    await folder.write(NAVIGATION_PATH, resourceText(navigation));
    await this.open(folder);
  }

  close(): void {
    this.folder.set(null);
    this.manifest.set(null);
    this.resources.set([]);
    this.dataSources.set({});
  }

  /** Reads again the list of the resources (and the data sources documents) from the folder. */
  async refresh(): Promise<void> {
    const folder = this.requireFolder();
    const resources = (await folder.list()).map(resourceAt).filter((r): r is ProjectResource => r !== null);
    this.resources.set(resources.sort(compareResources));
    const sources: Record<string, DataSourcesDefinition> = {};
    for (const resource of resources.filter((r) => r.kind === 'datasources')) {
      try {
        const result = validateDataSources(JSON.parse(await folder.read(resource.path)));
        if (result.valid) sources[resource.id] = result.value;
      } catch {
        // A file that is not JSON: its references do not resolve (the screens show the problem).
      }
    }
    this.dataSources.set(sources);
  }

  /** The content of a resource file, as JSON. */
  async read(path: string): Promise<Json> {
    return JSON.parse(await this.requireFolder().read(path)) as Json;
  }

  has(kind: ResourceKind, id: string): boolean {
    return this.resources().some((r) => r.kind === kind && r.id === id);
  }

  /** Writes a resource (creating or replacing its file) and updates the list, the manifest and the data sources. */
  async write(resource: ProjectResource, doc: Json): Promise<void> {
    await this.requireFolder().write(resource.path, resourceText(doc));
    this.resources.update((list) => (list.some((r) => r.path === resource.path) ? list : [...list, resource].sort(compareResources)));
    if (resource.kind === 'project') {
      const result = validateProject(doc);
      if (result.valid) this.manifest.set(result.value);
    }
    if (resource.kind === 'datasources') {
      const result = validateDataSources(doc);
      this.dataSources.update(({ [resource.id]: _old, ...rest }) => (result.valid ? { ...rest, [resource.id]: result.value } : rest));
    }
  }

  /** Deletes the file of a resource (the manifest cannot be deleted). */
  async remove(resource: ProjectResource): Promise<void> {
    if (resource.kind === 'project') throw new Error('the manifest of the project cannot be deleted');
    await this.requireFolder().remove(resource.path);
    this.resources.update((list) => list.filter((r) => r.path !== resource.path));
    if (resource.kind === 'datasources') this.dataSources.update(({ [resource.id]: _gone, ...rest }) => rest);
  }

  private requireFolder(): ProjectFolder {
    const folder = this.folder();
    if (!folder) throw new Error('no project is open');
    return folder;
  }
}

const ORDER: ResourceKind[] = ['project', 'screen', 'datasources', 'navigation', 'theme', 'messages'];

function compareResources(a: ProjectResource, b: ProjectResource): number {
  return ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id);
}

/** The identifier written in a document of the kind (`screen`, `datasources`, `theme`…), if valid. */
export function documentId(kind: ResourceKind, doc: Json): string | null {
  if (!isObject(doc)) return null;
  if (kind === 'project') return 'project';
  if (kind === 'navigation') return 'navigation';
  const id = doc[kind];
  return typeof id === 'string' && RESOURCE_ID.test(id) ? id : null;
}
