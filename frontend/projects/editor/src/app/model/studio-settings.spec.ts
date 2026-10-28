import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { StudioSettings } from './studio-settings';

describe('settings of this installation of Studio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const settings = async (config: object): Promise<StudioSettings> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(config)));
    const studio = TestBed.inject(StudioSettings);
    await studio.loaded;
    return studio;
  };

  it('in the browser the registry is on unless the file switches it off', async () => {
    expect((await settings({})).registry()).toBe(true);
    TestBed.resetTestingModule();
    expect((await settings({ registry: false })).registry()).toBe(false);
  });

  it('in the desktop app the registry stays off, even when the file switches it on', async () => {
    vi.stubGlobal('__TAURI__', { fs: {}, dialog: {} });
    const studio = await settings({ registry: true, runtimeAddress: 'https://runtime.example/' });
    expect(studio.registry()).toBe(false);
    expect(studio.runtimeAddress()).toBe('https://runtime.example/');
  });
});
