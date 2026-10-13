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

const registry: RuntimeConfig = { definitions: { source: 'registry', app: 'demo', env: 'sviluppo', navigation: 'fatturazione', themes: ['chiaro', 'scuro'] } };

describe('configurazione del runtime: da dove vengono le definizioni', () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (body: unknown, ok = true): void => {
    vi.stubGlobal('fetch', async () => ({ ok, status: ok ? 200 : 404, json: async () => body }));
  };

  it('senza file, o con un file incompleto, si usano gli esempi', async () => {
    serve({}, false);
    expect(await loadRuntimeConfig()).toEqual(DEFAULT_RUNTIME_CONFIG);
    serve({ definitions: { source: 'registry', app: 'demo' } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await loadRuntimeConfig()).toEqual(DEFAULT_RUNTIME_CONFIG);
    serve(registry);
    expect(await loadRuntimeConfig()).toEqual(registry);
  });

  it('demo: le definizioni sono gli esempi', () => {
    TestBed.configureTestingModule({ providers: appConfigFor(DEFAULT_RUNTIME_CONFIG).providers });
    expect(TestBed.inject(DefinitionSource)).toBeInstanceOf(ExampleDefinitions);
  });

  it('servizi del BFF: sessione, permessi, dati e telemetria veri; il guscio usa l’utente della sessione', () => {
    TestBed.configureTestingModule({ providers: appConfigFor({ ...registry, services: { source: 'bff', appId: 'demo' } }).providers });
    expect(TestBed.inject(DataClient)).toBeInstanceOf(HttpDataClient);
    expect(TestBed.inject(Authorization)).toBeInstanceOf(HttpAuthorization);
    expect(TestBed.inject(RuntimeDiagnostics)).toBeInstanceOf(HttpDiagnostics);
    expect(TestBed.inject(ShellSession)).toBeInstanceOf(BffShellSession);
    expect(TestBed.inject(ShellSession).profiles).toEqual([]);
  });

  it('registro: menu e temi arrivano dalle versioni pubblicate nell’ambiente', async () => {
    TestBed.configureTestingModule({ providers: [...appConfigFor(registry).providers, provideHttpClientTesting()] });
    const source = TestBed.inject(DefinitionSource);
    expect(source).toBeInstanceOf(RegistryDefinitions);
    expect(source.themes()).toEqual(['chiaro', 'scuro']);
    const http = TestBed.inject(HttpTestingController);
    const navigation = TestBed.inject(NavigationService);
    http.expectOne('/registry/apps/demo/documents/navigation/fatturazione/published?env=sviluppo').flush(navigationDoc);
    await new Promise((r) => setTimeout(r, 0));
    expect(navigation.problems()).toEqual([]);
    expect(navigation.runtime()?.definition.navigation).toBe('fatturazione');
  });
});
