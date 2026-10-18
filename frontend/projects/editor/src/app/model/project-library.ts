import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { DirectoryFolder, MemoryFolder, type DirectoryHandle, type ProjectFolder } from './project-folder';

/** Folder of the private storage of the browser that holds the projects kept in the browser. */
const BROWSER_ROOT = 'quadrava-projects';
/** The last project opened, to offer it again at the next visit. */
export const LAST_PROJECT_KEY = 'lc.editor.project';
/** IndexedDB database and store where the handle of the last folder on disk is kept (a handle cannot go in localStorage). */
const DB = 'quadrava-studio';
const STORE = 'handles';

/** The last project opened: in the browser (by name) or on disk (the handle, asking for permission again). */
export type LastProject = { location: 'browser'; name: string } | { location: 'disk'; name: string };

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

  /** The browser lets the user choose a folder on disk to read and write. */
  canUseDisk(): boolean {
    return typeof this.window?.showDirectoryPicker === 'function';
  }

  /** The browser has a private file storage (otherwise projects live in memory, for the visit only). */
  canUseBrowser(): boolean {
    return typeof (navigator.storage as StorageWithDirectory | undefined)?.getDirectory === 'function';
  }

  async refresh(): Promise<void> {
    const root = await this.browserRoot();
    const names: string[] = [];
    if (root) for await (const entry of root.values()) if (entry.kind === 'directory') names.push(entry.name);
    this.browserProjects.set(names.sort());
  }

  /** Asks the user for a folder on disk (null if they cancel). */
  async chooseDiskFolder(): Promise<ProjectFolder | null> {
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
    const root = await this.browserRoot();
    await root?.removeEntry(name, { recursive: true });
    if (this.last()?.location === 'browser' && this.last()?.name === name) this.forgetLast();
    await this.refresh();
  }

  /** Remembers the project just opened, to offer it again at the next visit. */
  async remember(folder: ProjectFolder): Promise<void> {
    if (folder.location === 'memory') return;
    const last: LastProject = { location: folder.location, name: folder.name };
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
    const handle = await loadHandle().catch(() => null);
    if (!handle) return null;
    const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (permission !== 'granted' && (await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') return null;
    return new DirectoryFolder(handle, 'disk');
  }

  private async browserRoot(): Promise<DirectoryHandle | null> {
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
    return parsed && (parsed.location === 'browser' || parsed.location === 'disk') && typeof parsed.name === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeHandle(handle: DirectoryHandle): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, 'last');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadHandle(): Promise<DirectoryHandle | null> {
  const db = await database();
  const handle = await new Promise<DirectoryHandle | null>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get('last');
    request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}
