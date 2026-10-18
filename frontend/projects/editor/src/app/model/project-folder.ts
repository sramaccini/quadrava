/**
 * The folder of a project: the JSON files of its resources, by path from the folder (`screens/order-list.json`). One
 * interface for a folder on disk (File System Access API, Chrome and Edge), a folder in the private storage of the browser
 * (Origin Private File System, every modern browser) and a folder in memory (tests).
 */
export interface ProjectFolder {
  /** Name of the folder, shown to the user. */
  readonly name: string;
  /** Where it is: on disk (chosen by the user) or in the browser. */
  readonly location: 'disk' | 'browser' | 'memory';
  /** Paths of the JSON files, sorted. */
  list(): Promise<string[]>;
  /** Text of a file; throws if it does not exist. */
  read(path: string): Promise<string>;
  /** Writes a file, creating the folders it needs. */
  write(path: string, text: string): Promise<void>;
  /** Removes a file (nothing if it does not exist). */
  remove(path: string): Promise<void>;
}

/** The parts of the File System Access API used here. */
interface WritableFile {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
}
export interface DirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<FileHandle | DirectoryHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

/** A path inside the project: folders and a JSON file, without `..` or empty parts. */
export const RESOURCE_PATH = /^([a-z0-9][a-z0-9-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

function parts(path: string): { folders: string[]; file: string } {
  if (!RESOURCE_PATH.test(path)) throw new Error(`invalid path: ${path}`);
  const all = path.split('/');
  return { folders: all.slice(0, -1), file: all.at(-1)! };
}

/** A folder reached through a directory handle: on disk or in the private storage of the browser. */
export class DirectoryFolder implements ProjectFolder {
  constructor(
    readonly handle: DirectoryHandle,
    readonly location: 'disk' | 'browser',
  ) {}

  get name(): string {
    return this.handle.name;
  }

  async list(): Promise<string[]> {
    const found: string[] = [];
    const visit = async (dir: DirectoryHandle, prefix: string, depth: number): Promise<void> => {
      for await (const entry of dir.values()) {
        if (entry.kind === 'directory') {
          // Resources sit at most one folder down (screens/, themes/…); hidden folders (.git) are skipped.
          if (depth < 1 && !entry.name.startsWith('.') && entry.name !== 'node_modules') await visit(entry, `${prefix}${entry.name}/`, depth + 1);
        } else if (entry.name.endsWith('.json')) found.push(prefix + entry.name);
      }
    };
    await visit(this.handle, '', 0);
    return found.sort();
  }

  async read(path: string): Promise<string> {
    const { folders, file } = parts(path);
    let dir = this.handle;
    for (const folder of folders) dir = await dir.getDirectoryHandle(folder);
    return (await (await dir.getFileHandle(file)).getFile()).text();
  }

  async write(path: string, text: string): Promise<void> {
    const { folders, file } = parts(path);
    let dir = this.handle;
    for (const folder of folders) dir = await dir.getDirectoryHandle(folder, { create: true });
    const writable = await (await dir.getFileHandle(file, { create: true })).createWritable();
    await writable.write(text);
    await writable.close();
  }

  async remove(path: string): Promise<void> {
    const { folders, file } = parts(path);
    try {
      let dir = this.handle;
      for (const folder of folders) dir = await dir.getDirectoryHandle(folder);
      await dir.removeEntry(file);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e;
    }
  }
}

/** A folder in memory: for tests, and where the browser has no file storage at all. */
export class MemoryFolder implements ProjectFolder {
  readonly location = 'memory' as const;
  readonly files = new Map<string, string>();

  constructor(
    readonly name: string,
    files: Record<string, string> = {},
  ) {
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
  }

  async list(): Promise<string[]> {
    return [...this.files.keys()].sort();
  }

  async read(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw new DOMException(`${path} not found`, 'NotFoundError');
    return text;
  }

  async write(path: string, text: string): Promise<void> {
    parts(path);
    this.files.set(path, text);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}
