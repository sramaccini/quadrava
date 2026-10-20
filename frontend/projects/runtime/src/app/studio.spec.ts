import { vi } from 'vitest';
import type { ProjectSnapshot } from 'core';
import { loadRuntimeConfig } from './runtime-config';
import { followStudio, receiveProject, studioOrigin, studioSettings, type StudioWindow } from './studio';

const STUDIO = 'http://localhost:4201';
const project = (): ProjectSnapshot => ({
  manifest: { schemaVersion: '1.0', project: 'staff', name: 'Staff', languages: ['it', 'en'], defaultLanguage: 'it', themes: ['dark'] },
  navigation: { navigation: 'main' },
  screens: { 'staff-list': { screen: 'staff-list' } },
  dataSources: {},
  themes: { dark: {}, light: {} },
  messages: { it: {}, en: {} },
});
const message = (data: unknown, origin = STUDIO, source: MessageEventSource | null = window): void => {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
};

describe('runtime opened by Studio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('accepts only the origins of Studio listed in the configuration', () => {
    const config = { definitions: { source: 'examples' as const }, studio: { origins: [STUDIO] } };
    expect(studioOrigin(config, `?studio=${encodeURIComponent(STUDIO)}`)).toBe(STUDIO);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(studioOrigin(config, '?studio=https://evil.example')).toBeNull();
    expect(studioOrigin({ definitions: { source: 'examples' } }, `?studio=${STUDIO}`)).toBeNull();
    expect(studioOrigin(config, '')).toBeNull();
  });

  it('a tab opened by Studio remembers it: a reload asks again even when the routes dropped ?studio=', () => {
    const config = { definitions: { source: 'examples' as const }, studio: { origins: [STUDIO] } };
    expect(studioOrigin(config, '', STUDIO)).toBe(STUDIO);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(studioOrigin(config, '', 'https://evil.example')).toBeNull();
    expect(studioOrigin(config, '', null)).toBeNull();
  });

  it('the configuration keeps only well-formed origins', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ definitions: { source: 'examples' }, studio: { origins: [STUDIO, 'http://localhost:4201/path', 'nope', 3] } }) }));
    expect((await loadRuntimeConfig()).studio).toEqual({ origins: [STUDIO] });
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ definitions: { source: 'examples' } }) }));
    expect((await loadRuntimeConfig()).studio).toBeUndefined();
  });

  it('asks the opener for the project and takes it only from that window and origin', async () => {
    const sent: unknown[] = [];
    const opener = window as unknown as StudioWindow;
    vi.spyOn(window, 'postMessage').mockImplementation(((data: unknown, origin: string) => void sent.push([data, origin])) as unknown as typeof window.postMessage);
    const received = receiveProject(STUDIO, opener, 1000);
    expect(sent).toEqual([[{ type: 'lc-studio:ready' }, STUDIO]]);
    message({ type: 'lc-studio:project', project: project() }, 'https://evil.example');
    message({ type: 'lc-studio:project', project: project() }, STUDIO, null);
    message({ type: 'lc-studio:project', project: { screens: 'x' } });
    message({ type: 'lc-studio:project', project: project() });
    expect((await received).screens).toEqual({ 'staff-list': { screen: 'staff-list' } });
  });

  it('gives up when Studio does not answer, or when there is no opener', async () => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await expect(receiveProject(STUDIO, window as unknown as StudioWindow, 10)).rejects.toThrow('Studio did not send the project');
    await expect(receiveProject(STUDIO, null)).rejects.toThrow('no Studio window');
    await expect(receiveProject(STUDIO, { postMessage: () => undefined, closed: true })).rejects.toThrow('no Studio window');
  });

  it('«Run project» again reloads the window', () => {
    const reload = vi.fn();
    const stop = followStudio(STUDIO, window, reload);
    message({ type: 'lc-studio:reload' }, 'https://evil.example');
    message({ type: 'lc-studio:reload' });
    stop();
    message({ type: 'lc-studio:reload' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('languages and themes come from the manifest of the project', async () => {
    expect(await studioSettings(project())).toEqual({ languages: ['it', 'en'], defaultLanguage: 'it', themes: ['dark'] });
    expect(await studioSettings({ ...project(), manifest: null })).toEqual({ languages: ['en', 'it'], defaultLanguage: 'en', themes: ['dark', 'light'] });
  });
});
