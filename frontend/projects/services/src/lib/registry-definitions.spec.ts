import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DefinitionSource } from 'core';
import { DefinitionLoadError, provideRegistryDefinitions } from './registry-definitions';

describe('definizioni dal registro', () => {
  let http: HttpTestingController;
  let source: DefinitionSource;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRegistryDefinitions({ app: 'gestione ordini', env: 'produzione', navigation: 'ordini', themes: ['chiaro', 'scuro'] }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    source = TestBed.inject(DefinitionSource);
  });

  afterEach(() => http.verify());

  it('carica la versione pubblicata di ogni documento, separatamente', async () => {
    const screen = source.screen('ordini-elenco');
    http.expectOne('/registry/apps/gestione%20ordini/documents/screen/ordini-elenco/published?env=produzione').flush({ screen: 'ordini-elenco' });
    expect(await screen).toEqual({ screen: 'ordini-elenco' });
    const navigation = source.navigation();
    http.expectOne('/registry/apps/gestione%20ordini/documents/navigation/ordini/published?env=produzione').flush({ navigation: 'ordini' });
    expect(await navigation).toEqual({ navigation: 'ordini' });
    const theme = source.theme('scuro');
    http.expectOne((r) => r.url === '/registry/apps/gestione%20ordini/documents/theme/scuro/published').flush({ theme: 'scuro' });
    expect(await theme).toEqual({ theme: 'scuro' });
    expect(source.themes()).toEqual(['chiaro', 'scuro']);
  });

  it('con l’ETag ricarica senza riscaricare: 304 riusa la copia', async () => {
    const first = source.screen('a');
    http.expectOne((r) => r.url.endsWith('/screen/a/published')).flush({ v: 1 }, { headers: { ETag: '"h1"' } });
    expect(await first).toEqual({ v: 1 });
    const second = source.screen('a');
    const request = http.expectOne((r) => r.url.endsWith('/screen/a/published'));
    expect(request.request.headers.get('If-None-Match')).toBe('"h1"');
    request.flush(null, { status: 304, statusText: 'Not Modified' });
    expect(await second).toEqual({ v: 1 });
  });

  it('un documento non pubblicato è un errore con il solo stato', async () => {
    const missing = source.screen('manca');
    http.expectOne((r) => r.url.endsWith('/screen/manca/published')).flush({ detail: 'interno' }, { status: 404, statusText: 'Not Found' });
    await expect(missing).rejects.toEqual(new DefinitionLoadError(404));
  });

  it('il catalogo di una lingua è il documento messages pubblicato: se ne restituiscono i testi', async () => {
    const p = source.messages('en');
    const req = http.expectOne((r) => r.url === '/registry/apps/gestione%20ordini/documents/messages/en/published');
    expect(req.request.params.get('env')).toBe('produzione');
    req.flush({ schemaVersion: '1.0', messages: 'en', texts: { 'app.title': 'Hello' } }, { headers: { ETag: '"m1"' } });
    expect(await p).toEqual({ 'app.title': 'Hello' });
  });
});
