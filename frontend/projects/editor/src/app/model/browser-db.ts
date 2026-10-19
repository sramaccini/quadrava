import { RESOURCE_PATH, type ProjectFolder } from './project-folder';

/**
 * The IndexedDB database of Studio: the handle of the last project folder on disk (`handles`) and, where the private file
 * storage of the browser cannot be written from the page (Safari), the files of the projects kept in the browser (`files`,
 * key `<project>/<path>`).
 */
const DB = 'quadrava-studio';
const VERSION = 2;
export const HANDLES = 'handles';
const FILES = 'files';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs a request on a store and closes the database. */
export async function request<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Keys from `<prefix>` (included) to the end of the prefix: those of one project. */
function range(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + '\uffff');
}

/** Names of the projects kept in IndexedDB. */
export async function databaseProjects(): Promise<string[]> {
  const keys = (await request(FILES, 'readonly', (s) => s.getAllKeys())) as string[];
  return [...new Set(keys.map((k) => k.split('/')[0]))].sort();
}

export async function deleteDatabaseProject(name: string): Promise<void> {
  await request(FILES, 'readwrite', (s) => s.delete(range(`${name}/`)));
}

/** A project kept in IndexedDB: the same files as a folder, where the private file storage cannot be written. */
export class DatabaseFolder implements ProjectFolder {
  readonly location = 'browser' as const;

  constructor(readonly name: string) {}

  async list(): Promise<string[]> {
    const prefix = `${this.name}/`;
    const keys = (await request(FILES, 'readonly', (s) => s.getAllKeys(range(prefix)))) as string[];
    return keys.map((k) => k.slice(prefix.length)).sort();
  }

  async read(path: string): Promise<string> {
    const text = (await request(FILES, 'readonly', (s) => s.get(`${this.name}/${path}`))) as string | undefined;
    if (text === undefined) throw new DOMException(`${path} not found`, 'NotFoundError');
    return text;
  }

  async write(path: string, text: string): Promise<void> {
    if (!RESOURCE_PATH.test(path)) throw new Error(`invalid path: ${path}`);
    await request(FILES, 'readwrite', (s) => s.put(text, `${this.name}/${path}`));
  }

  async remove(path: string): Promise<void> {
    await request(FILES, 'readwrite', (s) => s.delete(`${this.name}/${path}`));
  }
}
