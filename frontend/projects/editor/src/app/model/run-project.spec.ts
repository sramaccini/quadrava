import { TestBed } from '@angular/core/testing';
import { Confirmation, Notifier } from 'core';
import { vi } from 'vitest';
import type { Json } from './doc-ops';
import { Project } from './project';
import { MemoryFolder } from './project-folder';
import { projectSnapshot } from './project-snapshot';
import { configuredRuntimeAddress, defaultRuntimeAddress, RUNTIME_ADDRESS_KEY, RunProject, runtimeUrl, STUDIO_CONFIG_URL } from './run-project';

describe('running the project in the runtime', () => {
  describe('snapshot', () => {
    const files: Record<string, Json> = {
      'project.json': { project: 'staff' },
      'navigation.json': { navigation: 'main' },
      'screens/staff-list.json': { screen: 'staff-list', title: 'saved' },
      'screens/staff-edit.json': { screen: 'staff-edit' },
      'datasources/staff.json': { datasources: 'staff' },
      'themes/light.json': { theme: 'light' },
      'i18n/en.json': { 'a.b': 'saved' },
    };
    const resources = [
      { kind: 'project' as const, id: 'project', path: 'project.json' },
      { kind: 'navigation' as const, id: 'navigation', path: 'navigation.json' },
      { kind: 'screen' as const, id: 'staff-list', path: 'screens/staff-list.json' },
      { kind: 'screen' as const, id: 'staff-edit', path: 'screens/staff-edit.json' },
      { kind: 'screen' as const, id: 'broken', path: 'screens/broken.json' },
      { kind: 'datasources' as const, id: 'staff', path: 'datasources/staff.json' },
      { kind: 'theme' as const, id: 'light', path: 'themes/light.json' },
      { kind: 'messages' as const, id: 'en', path: 'i18n/en.json' },
    ];
    const read = async (path: string): Promise<Json> => {
      if (!(path in files)) throw new Error('not JSON');
      return files[path];
    };

    it('the files of the project, with the open documents in their place and the catalogues as the screens see them', async () => {
      const snapshot = await projectSnapshot(
        resources,
        read,
        [
          { kind: 'screen', path: 'screens/staff-list.json', doc: { screen: 'staff-list', title: 'unsaved' } },
          { kind: 'screen', path: null, doc: { screen: 'staff-new' } },
          { kind: 'screen', path: null, doc: { screen: 'Not An Id' } },
        ],
        { en: { 'a.b': 'unsaved' } },
      );
      expect(snapshot.manifest).toEqual({ project: 'staff' });
      expect(snapshot.navigation).toEqual({ navigation: 'main' });
      expect(snapshot.screens).toEqual({
        'staff-list': { screen: 'staff-list', title: 'unsaved' },
        'staff-edit': { screen: 'staff-edit' },
        'staff-new': { screen: 'staff-new' },
      });
      expect(snapshot.dataSources).toEqual({ staff: { datasources: 'staff' } });
      expect(snapshot.themes).toEqual({ light: { theme: 'light' } });
      expect(snapshot.messages).toEqual({ en: { 'a.b': 'unsaved' } });
    });
  });

  it('address: the port before Studio in development, http(s) only, with the origin of Studio', () => {
    expect(defaultRuntimeAddress({ protocol: 'http:', hostname: 'localhost', port: '4201', origin: 'http://localhost:4201' })).toBe('http://localhost:4200/');
    expect(defaultRuntimeAddress({ protocol: 'https:', hostname: 'studio.example', port: '', origin: 'https://studio.example' })).toBe('https://studio.example/');
    expect(runtimeUrl('http://localhost:4200/', 'http://localhost:4201')).toBe('http://localhost:4200/?studio=http%3A%2F%2Flocalhost%3A4201');
    expect(runtimeUrl('javascript:alert(1)', 'http://localhost:4201')).toBeNull();
    expect(runtimeUrl('not an address', 'http://localhost:4201')).toBeNull();
  });

  it('address: the settings of a published Studio come before the guess, the choice of the user before both', async () => {
    expect(configuredRuntimeAddress({ runtimeAddress: ' https://runtime.example/ ' })).toBe('https://runtime.example/');
    expect(configuredRuntimeAddress({ runtimeAddress: 'javascript:alert(1)' })).toBeNull();
    expect(configuredRuntimeAddress('<!doctype html>')).toBeNull();
    localStorage.removeItem(RUNTIME_ADDRESS_KEY);
    TestBed.configureTestingModule({ providers: [
      { provide: Notifier, useValue: { toast: () => undefined } },
      { provide: Confirmation, useValue: { confirm: async () => true } },
    ] });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ runtimeAddress: 'https://runtime.example/' })));
    try {
      const run = TestBed.inject(RunProject);
      expect(fetch).toHaveBeenCalledWith(STUDIO_CONFIG_URL, { cache: 'no-cache' });
      await vi.waitFor(() => expect(run.address()).toBe('https://runtime.example/'));
      run.setAddress('http://localhost:4300/');
      expect(run.address()).toBe('http://localhost:4300/');
    } finally {
      vi.restoreAllMocks();
      localStorage.removeItem(RUNTIME_ADDRESS_KEY);
    }
  });

  describe('the window of the runtime', () => {
    const RUNTIME = 'http://localhost:4200';
    let runtime: { postMessage: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; closed: boolean };

    beforeEach(async () => {
      TestBed.configureTestingModule({ providers: [
          { provide: Notifier, useValue: { toast: () => undefined } },
          { provide: Confirmation, useValue: { confirm: async () => true } },
        ] });
      localStorage.setItem(RUNTIME_ADDRESS_KEY, `${RUNTIME}/`);
      runtime = { postMessage: vi.fn(), focus: vi.fn(), closed: false };
      vi.spyOn(window, 'open').mockReturnValue(runtime as unknown as Window);
      const folder = new MemoryFolder('staff');
      await folder.write('project.json', JSON.stringify({ schemaVersion: '1.0', project: 'staff', name: 'Staff', languages: ['en'], defaultLanguage: 'en' }));
      await folder.write('screens/staff-list.json', JSON.stringify({ screen: 'staff-list' }));
      await TestBed.inject(Project).open(folder);
    });
    afterEach(() => {
      vi.restoreAllMocks();
      localStorage.removeItem(RUNTIME_ADDRESS_KEY);
    });

    const ready = (origin: string, source: unknown): void => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'lc-studio:ready' }, origin, source: source as MessageEventSource }));
    };

    it('opens the runtime, answers its request with the project only to that window and origin, then reloads it', async () => {
      const run = TestBed.inject(RunProject);
      expect(run.run()).toBe('opened');
      expect(window.open).toHaveBeenCalledWith(`${RUNTIME}/?studio=${encodeURIComponent(location.origin)}`, 'quadrava-run');
      // Someone else, or another origin: no answer. jsdom accepts only real windows as source: this window stands for others.
      ready('https://evil.example', window);
      ready(RUNTIME, window);
      await new Promise((r) => setTimeout(r, 0));
      expect(runtime.postMessage).not.toHaveBeenCalled();
      // The real handshake comes from the opened window: simulated by calling the listener with it as source.
      const event = new MessageEvent('message', { data: { type: 'lc-studio:ready' }, origin: RUNTIME });
      Object.defineProperty(event, 'source', { value: runtime });
      window.dispatchEvent(event);
      await vi.waitFor(() => expect(runtime.postMessage).toHaveBeenCalled());
      const [message, origin] = runtime.postMessage.mock.calls[0];
      expect(origin).toBe(RUNTIME);
      expect(message.type).toBe('lc-studio:project');
      expect(message.project.screens).toEqual({ 'staff-list': { screen: 'staff-list' } });
      // Again: the same window is reloaded and brought to the front.
      expect(run.run()).toBe('reloaded');
      expect(runtime.postMessage).toHaveBeenLastCalledWith({ type: 'lc-studio:reload' }, RUNTIME);
      expect(runtime.focus).toHaveBeenCalled();
    });

    it('a popup blocked, or an address that is not http(s), are said', () => {
      const run = TestBed.inject(RunProject);
      vi.mocked(window.open).mockReturnValue(null);
      expect(run.run()).toBe('blocked');
      expect(run.setAddress('ftp://x')).toBe(false);
      expect(run.setAddress(' http://localhost:4300/ ')).toBe(true);
      expect(localStorage.getItem(RUNTIME_ADDRESS_KEY)).toBe('http://localhost:4300/');
    });
  });
});
