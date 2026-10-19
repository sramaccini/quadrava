import { Injectable, inject } from '@angular/core';
import { Confirmation, I18n, Notifier } from 'core';
import { validateProject } from 'schema';
import { isObject, type Json, type JsonObject } from './doc-ops';
import { emptyDataSources } from './datasources-store';
import { FileAccess } from './file-access';
import { emptyNavigation } from './navigation-store';
import { Project, documentId, newManifest, resourcePath, type ProjectResource } from './project';
import { RESOURCE_PATH, type ProjectFolder } from './project-folder';
import { ProjectLibrary } from './project-library';
import { SavedDocuments, type EditorKind } from './saved-documents';
import { emptyScreen } from './templates';
import { emptyTheme } from './theme-store';
import { createZip, readZip } from './zip';
import { Workspace, documentKind, type DocumentWindow } from './workspace';

/** Name of the demo project in the browser. */
export const DEMO_PROJECT = 'demo';

/**
 * The commands of Studio on projects and their resources: create, open and close a project (with its windows), create,
 * import, save and delete resources. They report the outcome with a message and ask for confirmation before losing changes.
 */
@Injectable({ providedIn: 'root' })
export class ProjectCommands {
  private readonly project = inject(Project);
  private readonly library = inject(ProjectLibrary);
  private readonly workspace = inject(Workspace);
  private readonly saved = inject(SavedDocuments);
  private readonly files = inject(FileAccess);
  private readonly confirmation = inject(Confirmation);
  private readonly notifier = inject(Notifier);
  private readonly i18n = inject(I18n);
  private readonly t = (key: string, params: Record<string, unknown> = {}): string => this.i18n.t(key, params);

  /** Opens the project in a folder (closing the one open, if the user agrees) and restores its windows. */
  async open(folder: ProjectFolder): Promise<boolean> {
    if (this.project.isOpen() && !(await this.close())) return false;
    try {
      await this.project.open(folder);
    } catch (e) {
      this.fail('ed.project.openFailed', e);
      return false;
    }
    await this.library.remember(folder);
    this.workspace.attach(this.project.key()!);
    this.notifier.toast(this.t('ed.project.opened', { name: this.project.manifest()?.name ?? folder.name }));
    return true;
  }

  /** Closes the project and its windows; with unsaved changes it asks first. Their drafts stay for the next time. */
  async close(): Promise<boolean> {
    const unsaved = this.workspace.windows().filter((w) => this.workspace.isUnsaved(w));
    if (unsaved.length && !(await this.confirmation.confirm(this.t('ed.project.closeUnsaved', { n: unsaved.length })))) return false;
    this.workspace.detach();
    this.project.close();
    return true;
  }

  /** Creates a project (on disk, in a folder the user chooses, or in the browser) and opens it. */
  async create(name: string, id: string, location: 'disk' | 'browser'): Promise<boolean> {
    let folder: ProjectFolder | null;
    if (location === 'disk') {
      folder = await this.library.chooseDiskFolder();
    } else {
      await this.library.refresh();
      if (this.library.browserProjects().includes(id)) {
        this.notifier.toast(this.t('ed.project.exists', { name: id }), 'error');
        return false;
      }
      folder = await this.library.browserFolder(id, true);
    }
    if (!folder) return false;
    if (this.project.isOpen() && !(await this.close())) return false;
    try {
      await this.project.create(folder, newManifest(id, name), emptyNavigation(this.t));
    } catch (e) {
      this.fail('ed.project.createFailed', e);
      return false;
    }
    await this.library.refresh().catch(() => undefined);
    return this.open(folder);
  }

  /** Opens the demo project kept in the browser, copying it there from the examples the first time. */
  async openDemo(): Promise<boolean> {
    const folder = await this.library.browserFolder(DEMO_PROJECT, true);
    if (!folder) return false;
    try {
      if (!(await folder.list()).includes('project.json')) {
        const response = await fetch('examples/files.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        for (const path of (await response.json()) as string[]) {
          const file = await fetch(`examples/${path.split('/').map(encodeURIComponent).join('/')}`);
          if (file.ok) await folder.write(path, await file.text());
        }
      }
    } catch (e) {
      this.fail('ed.project.openFailed', e);
      return false;
    }
    await this.library.refresh().catch(() => undefined);
    return this.open(folder);
  }

  /** Creates a resource of the project with its starting content and opens it (the navigation: only one, opened if there). */
  async createResource(kind: EditorKind, title = '', id = ''): Promise<DocumentWindow | null> {
    if (kind === 'navigation' && this.project.has('navigation', 'navigation')) {
      return this.workspace.openResource({ kind, id: 'navigation', path: resourcePath('navigation', 'navigation') });
    }
    const doc = this.starting(kind, title, id);
    const resource: ProjectResource = { kind, id: kind === 'navigation' ? 'navigation' : id, path: resourcePath(kind, id) };
    try {
      await this.project.write(resource, doc);
      return await this.workspace.openResource(resource);
    } catch (e) {
      this.fail('ed.saveFailed', e);
      return null;
    }
  }

  /** Deletes a resource after a confirmation, closing its window. */
  async deleteResource(resource: ProjectResource, label: string): Promise<boolean> {
    if (!(await this.confirmation.confirm(this.t('ed.project.confirmDelete', { name: label })))) return false;
    const open = this.workspace.windowOf(resource.path);
    if (open) this.workspace.close(open.id);
    try {
      await this.project.remove(resource);
      this.notifier.toast(this.t('ed.project.deleted', { name: label }));
      return true;
    } catch (e) {
      this.fail('ed.saveFailed', e);
      return false;
    }
  }

  /**
   * Imports a document (a file, an example, a registry version) into the project: it is written as the resource of its kind
   * and identifier (asking first if one is already there) and opened. Returns its window, or null if not imported.
   */
  async importDocument(doc: Json, from: string): Promise<DocumentWindow | null> {
    const kind = documentKind(doc);
    const id = kind && kind !== 'project' ? documentId(kind, doc) : null;
    if (!kind || kind === 'project' || !id) {
      this.notifier.toast(this.t('ed.loadFailed', { e: this.t('ed.unknownKind') }), 'error');
      return null;
    }
    const resource: ProjectResource = { kind, id: kind === 'navigation' ? 'navigation' : id, path: resourcePath(kind, id) };
    if (this.project.resources().some((r) => r.path === resource.path) && !(await this.confirmation.confirm(this.t('ed.import.replace', { path: resource.path })))) return null;
    try {
      await this.project.write(resource, doc);
    } catch (e) {
      this.fail('ed.saveFailed', e);
      return null;
    }
    const open = this.workspace.windowOf(resource.path);
    if (open) {
      open.state.load(doc);
      this.saved.markSaved(open.id, doc);
      this.workspace.focus(open.id);
    }
    const win = open ?? (await this.workspace.openResource(resource));
    this.notifier.toast(this.t('ed.imported', { name: from, path: resource.path }));
    return win;
  }

  /** Saves a window in its resource of the project (or, outside a project, to a file). */
  async save(win: DocumentWindow): Promise<boolean> {
    if (!this.project.isOpen()) return this.export(win);
    try {
      const resource = await this.workspace.saveToProject(win);
      if (resource.kind === 'project') await this.ensureCatalogues();
      const errors = win.state.errorCount();
      this.notifier.toast(errors ? this.t('ed.savedWithErrors', { name: resource.path, n: errors }) : this.t('ed.savedFile', { name: resource.path }));
      return true;
    } catch (e) {
      this.fail('ed.saveFailed', e);
      return false;
    }
  }

  /** Saves every window with unsaved changes; stops at the first failure. */
  async saveAll(): Promise<void> {
    for (const win of this.workspace.windows()) {
      if (this.workspace.isUnsaved(win) && !(await this.save(win))) return;
    }
  }

  /** The document of a window as a JSON file outside the project (downloaded, or written where the browser allows it). */
  async export(win: DocumentWindow): Promise<boolean> {
    const doc = win.state.doc();
    const name = this.workspace.name(win) ?? win.kind;
    try {
      const file = await this.files.save(win.id, doc, `${win.kind === 'project' ? 'project' : name}.json`);
      if (!file) return false;
      if (!this.project.isOpen()) this.saved.markSaved(win.id, doc);
      this.notifier.toast(this.t('ed.savedFile', { name: file }));
      return true;
    } catch (e) {
      this.fail('ed.saveFailed', e);
      return false;
    }
  }

  /** Every language of the project has its catalogue: the missing ones are created empty. */
  private async ensureCatalogues(): Promise<void> {
    for (const language of this.project.manifest()?.languages ?? []) {
      if (!this.project.has('messages', language)) await this.project.write({ kind: 'messages', id: language, path: resourcePath('messages', language) }, {});
    }
  }

  /** The whole project as a zip archive (its JSON files, with the project folder at the root), downloaded. */
  async exportZip(): Promise<boolean> {
    const folder = this.project.folder();
    const manifest = this.project.manifest();
    if (!folder || !manifest) return false;
    try {
      const files = await Promise.all((await folder.list()).map(async (path) => ({ path: `${manifest.project}/${path}`, text: await folder.read(path) })));
      this.files.download(await createZip(files), `${manifest.project}.zip`);
      this.notifier.toast(this.t('ed.project.exported', { name: `${manifest.project}.zip`, n: files.length }));
      return true;
    } catch (e) {
      this.fail('ed.saveFailed', e);
      return false;
    }
  }

  /**
   * A project from a zip archive (as `exportZip` writes it, or a zipped project folder): it goes into the browser, under the
   * identifier of its manifest (asking before replacing a project with the same name), and opens. Only the JSON files of the
   * project are taken.
   */
  async importZip(archive: Blob): Promise<boolean> {
    let files: { path: string; text: string }[];
    let manifest: ReturnType<typeof validateProject>;
    try {
      const all = await readZip(await archive.arrayBuffer());
      // The project may be at the root of the archive or in a folder of it.
      const root = all.map((f) => f.path).find((p) => p === 'project.json' || /^[^/]+\/project\.json$/.test(p));
      if (!root) throw new Error(this.t('ed.project.zipNoManifest'));
      const prefix = root.slice(0, -'project.json'.length);
      files = all.filter((f) => f.path.startsWith(prefix)).map((f) => ({ path: f.path.slice(prefix.length), text: f.text })).filter((f) => RESOURCE_PATH.test(f.path));
      manifest = validateProject(JSON.parse(files.find((f) => f.path === 'project.json')!.text));
      if (!manifest.valid) throw new Error(this.t('ed.project.zipBadManifest'));
    } catch (e) {
      this.fail('ed.project.openFailed', e);
      return false;
    }
    const id = manifest.value.project;
    await this.library.refresh();
    if (this.library.browserProjects().includes(id)) {
      if (!(await this.confirmation.confirm(this.t('ed.project.zipReplace', { name: id })))) return false;
      if (this.project.key() === `browser:${id}` && !(await this.close())) return false;
      await this.library.deleteBrowserProject(id);
    }
    const folder = await this.library.browserFolder(id, true);
    if (!folder) return false;
    try {
      for (const file of files) await folder.write(file.path, file.text);
    } catch (e) {
      this.fail('ed.project.openFailed', e);
      return false;
    }
    await this.library.refresh().catch(() => undefined);
    return this.open(folder);
  }

  /** The starting content of a new resource. */
  private starting(kind: EditorKind, title: string, id: string): Json {
    switch (kind) {
      case 'screen':
        return emptyScreen(this.t, title, id);
      case 'datasources':
        return { ...emptyDataSources(id), ...(title ? { description: title } : {}) };
      case 'theme': {
        const theme: JsonObject = { ...emptyTheme(), theme: id };
        if (title) theme['label'] = title;
        return theme;
      }
      case 'navigation':
        return emptyNavigation(this.t);
      default:
        return isObject(this.project.manifest() as unknown as Json) ? (this.project.manifest() as unknown as Json) : {};
    }
  }

  private fail(key: string, e: unknown): void {
    this.notifier.toast(this.t(key, { e: e instanceof Error ? e.message : String(e) }), 'error');
  }
}
