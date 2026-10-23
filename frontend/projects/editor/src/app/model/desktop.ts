import { RESOURCE_PATH, type ProjectFolder } from './project-folder';

/**
 * The parts of the Tauri APIs Studio uses in the desktop app (ADR-17). The app exposes them on `window.__TAURI__`
 * (`withGlobalTauri`), so the browser build of Studio carries no Tauri code: outside the desktop app they are missing.
 */
export interface DesktopApi {
  dialog: {
    open(options: { directory: true; multiple?: false; title?: string }): Promise<string | null>;
  };
  fs: {
    readDir(path: string): Promise<{ name: string; isDirectory: boolean; isFile: boolean }[]>;
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, text: string): Promise<void>;
    mkdir(path: string, options: { recursive: true }): Promise<void>;
    remove(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
  };
}

/** The Tauri APIs when Studio runs in the desktop app, otherwise null. */
export function desktopApi(scope: object | null | undefined = globalThis): DesktopApi | null {
  const api = (scope as { __TAURI__?: Partial<DesktopApi> } | null | undefined)?.__TAURI__;
  return api?.fs && api?.dialog ? (api as DesktopApi) : null;
}

/**
 * A project folder on disk in the desktop app, by its path. The app may touch only the folders the user chose in the
 * dialog (the scope of the `fs` plugin, kept between sessions by `persisted-scope`).
 */
export class DesktopFolder implements ProjectFolder {
  readonly location = 'disk' as const;

  constructor(
    readonly path: string,
    private readonly api: DesktopApi,
  ) {}

  get name(): string {
    return this.path.split(/[\\/]/).filter(Boolean).at(-1) ?? this.path;
  }

  async list(): Promise<string[]> {
    const found: string[] = [];
    const visit = async (dir: string, prefix: string, depth: number): Promise<void> => {
      for (const entry of await this.api.fs.readDir(dir)) {
        if (entry.isDirectory) {
          // As on the web: resources sit at most one folder down; hidden folders (.git) and node_modules are skipped.
          if (depth < 1 && !entry.name.startsWith('.') && entry.name !== 'node_modules') await visit(`${dir}/${entry.name}`, `${prefix}${entry.name}/`, depth + 1);
        } else if (entry.isFile && entry.name.endsWith('.json')) found.push(prefix + entry.name);
      }
    };
    await visit(this.path, '', 0);
    return found.sort();
  }

  async read(path: string): Promise<string> {
    return this.api.fs.readTextFile(this.file(path));
  }

  async write(path: string, text: string): Promise<void> {
    const file = this.file(path);
    const folder = path.split('/').slice(0, -1).join('/');
    if (folder) await this.api.fs.mkdir(`${this.path}/${folder}`, { recursive: true });
    await this.api.fs.writeTextFile(file, text);
  }

  async remove(path: string): Promise<void> {
    const file = this.file(path);
    if (await this.api.fs.exists(file)) await this.api.fs.remove(file);
  }

  /** The absolute path of a resource; the same rule as on the web keeps it inside the folder. */
  private file(path: string): string {
    if (!RESOURCE_PATH.test(path)) throw new Error(`invalid path: ${path}`);
    return `${this.path}/${path}`;
  }
}
