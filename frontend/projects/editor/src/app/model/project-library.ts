import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { DatabaseFolder, HANDLES, databaseProjects, deleteDatabaseProject, request } from './browser-db';
import { DesktopFolder, desktopApi } from './desktop';
import { DirectoryFolder, MemoryFolder, type DirectoryHandle, type ProjectFolder } from './project-folder';

/** Folder of the private storage of the browser that holds the projects kept in the browser. */
const BROWSER_ROOT = 'quadrava-projects';
/** The last project opened, to offer it again at the next visit. */
export const LAST_PROJECT_KEY = 'lc.editor.project';

/**
 * The last project opened: in the browser (by name) or on disk (the handle, asking for permission again; in the desktop app
 * its path).
 */
export type LastProject = { location: 'browser'; name: string } | { location: 'disk'; name: string; path?: string };

interface Pickers {
  showDirectoryPicker?: (options?: { mode?: 'readwrite'; id?: string }) => Promise<DirectoryHandle>;
}
interface StorageWithDirectory {
  getDirectory?: () => Promise<DirectoryHandle>;
}

/**
 * Where the projects are: folders on disk (chosen by the user, Chrome and Edge) and folders in the private storage of the
 * browser (every modern browser; they stay in that browser only). Remembers the last project opened.
 */
@Injectable({ providedIn: 'root' })
export class ProjectLibrary {
  private readonly window = inject(DOCUMENT).defaultView as (Window & Pickers) | null;
  /** Projects kept in this browser (names), read with `refresh`. */
  readonly browserProjects = signal<string[]>([]);
  readonly last = signal<LastProject | null>(readLast());
  /** The Tauri APIs when Studio runs in the desktop app (ADR-17). */
  private readonly desktop = desktopApi(this.window);

  /** The browser lets the user choose a folder on disk to read and write. */
  canUseDisk(): boolean {
    return !!this.desktop || typeof this.window?.showDirectoryPicker === 'function';
  }

  /** The last project opens at start without asking: one kept in the browser, or any in the desktop app. */
  reopensQuietly(): boolean {
    const last = this.last();
    return last?.location === 'browser' || (!!this.desktop && !!last && 'path' in last && !!last.path);
  }

  /**
   * Where the projects kept in the browser are: its private file storage, when the page can write files there; otherwise
   * (Safari) IndexedDB; without either, in memory for the visit only.
   */
  browserStorage(): 'files' | 'database' | 'memory' {
    const files = typeof (navigator.storage as StorageWithDirectory | undefined)?.getDirectory === 'function';
    const writable = typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
    if (files && writable) return 'files';
    return typeof indexedDB !== 'undefined' ? 'database' : 'memory';
  }

  async refresh(): Promise<void> {
    if (this.browserStorage() === 'database') {
      this.browserProjects.set(await databaseProjects().catch((): string[] => []));
      return;
    }
    const root = await this.browserRoot();
    const names: string[] = [];
    if (root) for await (const entry of root.values()) if (entry.kind === 'directory') names.push(entry.name);
    this.browserProjects.set(names.sort());
  }

  /** Asks the user for a folder on disk (null if they cancel). */
  async chooseDiskFolder(): Promise<ProjectFolder | null> {
    if (this.desktop) {
      const path = await this.desktop.dialog.open({ directory: true });
      return path ? new DesktopFolder(path, this.desktop) : null;
    }
    const picker = this.window?.showDirectoryPicker;
    if (!picker) return null;
    try {
      const handle = await picker.call(this.window, { mode: 'readwrite', id: 'quadrava-project' });
      return new DirectoryFolder(handle, 'disk');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }

  /** The folder of a project kept in the browser (created if `create`); in memory where the browser has no file storage. */
  async browserFolder(name: string, create = false): Promise<ProjectFolder | null> {
    if (this.browserStorage() === 'database') {
      const exists = (await databaseProjects().catch((): string[] => [])).includes(name);
      return exists || create ? new DatabaseFolder(name) : null;
    }
    const root = await this.browserRoot();
    if (!root) return create ? new MemoryFolder(name) : null;
    try {
      return new DirectoryFolder(await root.getDirectoryHandle(name, { create }), 'browser');
    } catch {
      return null;
    }
  }

  /** Deletes a project kept in the browser, with all its files. */
  async deleteBrowserProject(name: string): Promise<void> {
    if (this.browserStorage() === 'database') await deleteDatabaseProject(name);
    else await (await this.browserRoot())?.removeEntry(name, { recursive: true });
    if (this.last()?.location === 'browser' && this.last()?.name === name) this.forgetLast();
    await this.refresh();
  }

  /** Remembers the project just opened, to offer it again at the next visit. */
  async remember(folder: ProjectFolder): Promise<void> {
    if (folder.location === 'memory') return;
    const last: LastProject = folder instanceof DesktopFolder ? { location: 'disk', name: folder.name, path: folder.path } : { location: folder.location, name: folder.name };
    this.last.set(last);
    try {
      localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify(last));
    } catch {
      // Storage not available: nothing is offered at the next visit.
    }
    if (folder instanceof DirectoryFolder && folder.location === 'disk') await storeHandle(folder.handle).catch(() => undefined);
  }

  forgetLast(): void {
    this.last.set(null);
    try {
      localStorage.removeItem(LAST_PROJECT_KEY);
    } catch {
      // see remember
    }
  }

  /**
   * The folder of the last project. For a folder on disk the browser asks the user for permission again: call it from a
   * click. Null if the folder is no longer there or the user refuses.
   */
  async reopenLast(): Promise<ProjectFolder | null> {
    const last = this.last();
    if (!last) return null;
    if (last.location === 'browser') return this.browserFolder(last.name);
    if (this.desktop) {
      if (!last.path || !(await this.desktop.fs.exists(last.path).catch(() => false))) return null;
      return new DesktopFolder(last.path, this.desktop);
    }
    const handle = await loadHandle().catch(() => null);
    if (!handle) return null;
    const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (permission !== 'granted' && (await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') return null;
    return new DirectoryFolder(handle, 'disk');
  }

  private async browserRoot(): Promise<DirectoryHandle | null> {
    if (this.browserStorage() !== 'files') return null;
    const storage = navigator.storage as StorageWithDirectory | undefined;
    if (typeof storage?.getDirectory !== 'function') return null;
    try {
      return await (await storage.getDirectory()).getDirectoryHandle(BROWSER_ROOT, { create: true });
    } catch {
      return null;
    }
  }
}

function readLast(): LastProject | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_PROJECT_KEY) ?? 'null') as LastProject | null;
    if (!parsed || (parsed.location !== 'browser' && parsed.location !== 'disk') || typeof parsed.name !== 'string') return null;
    return parsed.location === 'disk' && typeof parsed.path !== 'string' ? { location: 'disk', name: parsed.name } : parsed;
  } catch {
    return null;
  }
}

async function storeHandle(handle: DirectoryHandle): Promise<void> {
  await request(HANDLES, 'readwrite', (store) => store.put(handle, 'last'));
}

async function loadHandle(): Promise<DirectoryHandle | null> {
  return ((await request(HANDLES, 'readonly', (store) => store.get('last'))) as DirectoryHandle | undefined) ?? null;
}
