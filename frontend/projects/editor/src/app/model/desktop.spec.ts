import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DesktopFolder, desktopApi, type DesktopApi } from './desktop';
import { LAST_PROJECT_KEY, ProjectLibrary } from './project-library';

/** The Tauri APIs over a map of files, as the desktop app would give them (paths with «/» or «\»). */
function fakeApi(files: Record<string, string>, chosen: string | null = 'C:\\work\\staff'): DesktopApi & { files: Map<string, string>; dialogs: unknown[] } {
  const map = new Map(Object.entries(files));
  const dialogs: unknown[] = [];
  const norm = (p: string) => p.replace(/\\/g, '/');
  return {
    files: map,
    dialogs,
    dialog: { open: async (options) => (dialogs.push(options), chosen) },
    fs: {
      readDir: async (dir) => {
        const prefix = norm(dir) + '/';
        const names = new Map<string, boolean>();
        for (const path of map.keys()) {
          if (!path.startsWith(prefix)) continue;
          const [first, ...rest] = path.slice(prefix.length).split('/');
          names.set(first, rest.length > 0);
        }
        return [...names].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory }));
      },
      readTextFile: async (path) => {
        const text = map.get(norm(path));
        if (text === undefined) throw new Error('not found');
        return text;
      },
      writeTextFile: async (path, text) => void map.set(norm(path), text),
      mkdir: async () => undefined,
      remove: async (path) => void map.delete(norm(path)),
      exists: async (path) => map.has(norm(path)) || [...map.keys()].some((k) => k.startsWith(norm(path) + '/')),
    },
  };
}

describe('Studio in the desktop app', () => {
  it('outside the desktop app there are no Tauri APIs', () => {
    expect(desktopApi({})).toBeNull();
    expect(desktopApi({ __TAURI__: { core: {} } })).toBeNull();
    const api = fakeApi({});
    expect(desktopApi({ __TAURI__: api })).toBe(api);
  });

  it('a project folder on disk: lists the JSON files one folder down, reads, writes and removes inside the folder only', async () => {
    const api = fakeApi({
      'C:/work/staff/project.json': '{}',
      'C:/work/staff/screens/staff-list.json': '{"screen":"staff-list"}',
      'C:/work/staff/screens/deep/ignored.json': '{}',
      'C:/work/staff/.git/config.json': '{}',
      'C:/work/staff/readme.md': '#',
    });
    const folder = new DesktopFolder('C:\\work\\staff', api);
    expect(folder.name).toBe('staff');
    expect(folder.location).toBe('disk');
    expect(await folder.list()).toEqual(['project.json', 'screens/staff-list.json']);
    expect(await folder.read('screens/staff-list.json')).toBe('{"screen":"staff-list"}');
    await folder.write('themes/light.json', '{"theme":"light"}');
    expect(api.files.get('C:/work/staff/themes/light.json')).toBe('{"theme":"light"}');
    await folder.remove('themes/light.json');
    await folder.remove('themes/missing.json');
    expect(api.files.has('C:/work/staff/themes/light.json')).toBe(false);
    await expect(folder.read('../secrets.json')).rejects.toThrow('invalid path');
    await expect(folder.write('screens/../../x.json', '{}')).rejects.toThrow('invalid path');
  });

  describe('the library of projects', () => {
    let api: ReturnType<typeof fakeApi>;
    const setup = () => {
      api = fakeApi({ 'C:/work/staff/project.json': '{}' });
      const win = Object.assign(Object.create(window) as Window, { __TAURI__: api });
      TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: win } }] });
      return TestBed.inject(ProjectLibrary);
    };
    afterEach(() => localStorage.removeItem(LAST_PROJECT_KEY));

    it('chooses the folder with the native dialog, remembers its path and reopens it at start without asking', async () => {
      localStorage.removeItem(LAST_PROJECT_KEY);
      const library = setup();
      expect(library.canUseDisk()).toBe(true);
      const folder = await library.chooseDiskFolder();
      expect(folder).toBeInstanceOf(DesktopFolder);
      // The subfolders of the project (screens/, themes/…) must be writable too.
      expect(api.dialogs).toEqual([{ directory: true, recursive: true }]);
      await library.remember(folder!);
      expect(JSON.parse(localStorage.getItem(LAST_PROJECT_KEY)!)).toEqual({ location: 'disk', name: 'staff', path: 'C:\\work\\staff' });
      expect(library.reopensQuietly()).toBe(true);
      expect(((await library.reopenLast()) as DesktopFolder).path).toBe('C:\\work\\staff');
      // A folder that is no longer there is not reopened.
      api.files.clear();
      expect(await library.reopenLast()).toBeNull();
    });
  });
});
