import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Authorization, DataClient, DefinitionSource, RuntimeDiagnostics } from 'core';
import { HttpAuthorization, HttpDataClient, HttpDiagnostics, LOWCODE_SERVICES_CONFIG, RegistryDefinitions } from 'services';
import { vi } from 'vitest';
import navigationDoc from '../../public/examples/navigation.json';
import { ExampleDefinitions } from '../demo/example-definitions';
import { appConfigFor } from './app.config';
import { NavigationService } from './navigation.service';
import { BffShellSession, ShellSession } from './shell-session';
import project from '../../public/examples/project.json';
import { DEFAULT_APPLICATION_SETTINGS, DEFAULT_RUNTIME_CONFIG, loadApplicationSettings, loadRuntimeConfig, type RuntimeConfig } from './runtime-config';

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

  it('settings of the application: from the demo project, or the languages of the registry configuration', async () => {
    serve(project);
    expect(await loadApplicationSettings(DEFAULT_RUNTIME_CONFIG)).toEqual({ languages: ['en', 'it'], defaultLanguage: 'en', themes: project.themes });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    serve({ ...project, languages: [] });
    expect(await loadApplicationSettings(DEFAULT_RUNTIME_CONFIG)).toEqual(DEFAULT_APPLICATION_SETTINGS);
    serve({}, false);
    expect(await loadApplicationSettings(DEFAULT_RUNTIME_CONFIG)).toEqual(DEFAULT_APPLICATION_SETTINGS);
    const withLanguages: RuntimeConfig = { definitions: { ...registry.definitions, languages: ['it', 'fr'], defaultLanguage: 'fr' } as RuntimeConfig['definitions'] };
    expect(await loadApplicationSettings(withLanguages)).toEqual({ languages: ['it', 'fr'], defaultLanguage: 'fr' });
    expect(await loadApplicationSettings(registry)).toEqual(DEFAULT_APPLICATION_SETTINGS);
    // The settings of the application: from the project with the examples, from the configuration with the registry.
    serve({ ...project, settings: { ordersApi: '/api/orders' } });
    expect((await loadApplicationSettings(DEFAULT_RUNTIME_CONFIG)).settings).toEqual({ ordersApi: '/api/orders' });
    const withSettings = { definitions: { ...registry.definitions, settings: { ordersApi: '/api/v2/orders', bad: 3, 'bad-name': 'x' } } } as unknown as RuntimeConfig;
    expect((await loadApplicationSettings(withSettings)).settings).toEqual({ ordersApi: '/api/v2/orders' });
    // The demo offers the themes of its project.
    TestBed.configureTestingModule({ providers: appConfigFor(DEFAULT_RUNTIME_CONFIG, { languages: ['en'], defaultLanguage: 'en', themes: ['dark'] }).providers });
    expect(TestBed.inject(DefinitionSource).themes()).toEqual(['dark']);
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
    // Without tenantSwitchUrl there is no tenant choice.
    expect(TestBed.inject(LOWCODE_SERVICES_CONFIG).tenantSwitchUrl).toBeNull();
    expect(TestBed.inject(ShellSession).tenants()).toEqual([]);
  });

  it('the tenant switch address reaches the services only as a path of the same origin', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bff = (tenantSwitchUrl: unknown) => ({ ...registry, services: { source: 'bff', appId: 'demo', tenantSwitchUrl } });
    serve(bff('/bff/tenant'));
    const config = await loadRuntimeConfig();
    expect(config.services).toEqual({ source: 'bff', appId: 'demo', tenantSwitchUrl: '/bff/tenant' });
    TestBed.configureTestingModule({ providers: appConfigFor(config).providers });
    expect(TestBed.inject(LOWCODE_SERVICES_CONFIG).tenantSwitchUrl).toBe('/bff/tenant');
    for (const wrong of ['https://other.example/tenant', '//other.example/tenant', 7]) {
      serve(bff(wrong));
      expect((await loadRuntimeConfig()).services).toEqual({ source: 'bff', appId: 'demo' });
    }
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
