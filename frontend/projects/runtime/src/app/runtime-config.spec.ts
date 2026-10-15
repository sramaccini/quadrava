import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Authorization, DataClient, DefinitionSource, RuntimeDiagnostics } from 'core';
import { HttpAuthorization, HttpDataClient, HttpDiagnostics, RegistryDefinitions } from 'services';
import { vi } from 'vitest';
import navigationDoc from '../../public/examples/navigation.json';
import { ExampleDefinitions } from '../demo/example-definitions';
import { appConfigFor } from './app.config';
import { NavigationService } from './navigation.service';
import { BffShellSession, ShellSession } from './shell-session';
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig, type RuntimeConfig } from './runtime-config';

const registry: RuntimeConfig = { definitions: { source: 'registry', app: 'demo', env: 'development', navigation: 'invoicing', themes: ['light', 'dark'] } };

describe('runtime configuration: where the definitions come from', () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (body: unknown, ok = true): void => {
    vi.stubGlobal('fetch', async () => ({ ok, status: ok ? 200 : 404, json: async () => body }));
  };

  it('without a file, or with an incomplete file, the examples are used', async () => {
    serve({}, false);
    expect(await loadRuntimeConfig()).toEqual(DEFAULT_RUNTIME_CONFIG);
    serve({ definitions: { source: 'registry', app: 'demo' } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await loadRuntimeConfig()).toEqual(DEFAULT_RUNTIME_CONFIG);
    serve(registry);
    expect(await loadRuntimeConfig()).toEqual(registry);
  });

  it('demo: the definitions are the examples', () => {
    TestBed.configureTestingModule({ providers: appConfigFor(DEFAULT_RUNTIME_CONFIG).providers });
    expect(TestBed.inject(DefinitionSource)).toBeInstanceOf(ExampleDefinitions);
  });

  it('BFF services: real session, permissions, data and telemetry; the shell uses the session user', () => {
    TestBed.configureTestingModule({ providers: appConfigFor({ ...registry, services: { source: 'bff', appId: 'demo' } }).providers });
    expect(TestBed.inject(DataClient)).toBeInstanceOf(HttpDataClient);
    expect(TestBed.inject(Authorization)).toBeInstanceOf(HttpAuthorization);
    expect(TestBed.inject(RuntimeDiagnostics)).toBeInstanceOf(HttpDiagnostics);
    expect(TestBed.inject(ShellSession)).toBeInstanceOf(BffShellSession);
    expect(TestBed.inject(ShellSession).profiles).toEqual([]);
  });

  it('registry: menu and themes come from the versions published in the environment', async () => {
    TestBed.configureTestingModule({ providers: [...appConfigFor(registry).providers, provideHttpClientTesting()] });
    const source = TestBed.inject(DefinitionSource);
    expect(source).toBeInstanceOf(RegistryDefinitions);
    expect(source.themes()).toEqual(['light', 'dark']);
    const http = TestBed.inject(HttpTestingController);
    const navigation = TestBed.inject(NavigationService);
    http.expectOne('/registry/apps/demo/documents/navigation/invoicing/published?env=development').flush(navigationDoc);
    await new Promise((r) => setTimeout(r, 0));
    expect(navigation.problems()).toEqual([]);
    expect(navigation.runtime()?.definition.navigation).toBe('invoicing');
  });
});
