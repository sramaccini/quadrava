import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DefinitionSource } from 'core';
import { DefinitionLoadError, provideRegistryDefinitions } from './registry-definitions';

describe('definitions from the registry', () => {
  let http: HttpTestingController;
  let source: DefinitionSource;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRegistryDefinitions({ app: 'order management', env: 'production', navigation: 'orders', themes: ['light', 'dark'] }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    source = TestBed.inject(DefinitionSource);
  });

  afterEach(() => http.verify());

  it('loads the published version of each document, separately', async () => {
    const screen = source.screen('order-list');
    http.expectOne('/registry/apps/order%20management/documents/screen/order-list/published?env=production').flush({ screen: 'order-list' });
    expect(await screen).toEqual({ screen: 'order-list' });
    const navigation = source.navigation();
    http.expectOne('/registry/apps/order%20management/documents/navigation/orders/published?env=production').flush({ navigation: 'orders' });
    expect(await navigation).toEqual({ navigation: 'orders' });
    const theme = source.theme('dark');
    http.expectOne((r) => r.url === '/registry/apps/order%20management/documents/theme/dark/published').flush({ theme: 'dark' });
    expect(await theme).toEqual({ theme: 'dark' });
    expect(source.themes()).toEqual(['light', 'dark']);
  });

  it('with the ETag it reloads without downloading again: 304 reuses the copy', async () => {
    const first = source.screen('a');
    http.expectOne((r) => r.url.endsWith('/screen/a/published')).flush({ v: 1 }, { headers: { ETag: '"h1"' } });
    expect(await first).toEqual({ v: 1 });
    const second = source.screen('a');
    const request = http.expectOne((r) => r.url.endsWith('/screen/a/published'));
    expect(request.request.headers.get('If-None-Match')).toBe('"h1"');
    request.flush(null, { status: 304, statusText: 'Not Modified' });
    expect(await second).toEqual({ v: 1 });
  });

  it('an unpublished document is an error with the status only', async () => {
    const missing = source.screen('missing');
    http.expectOne((r) => r.url.endsWith('/screen/missing/published')).flush({ detail: 'internal' }, { status: 404, statusText: 'Not Found' });
    await expect(missing).rejects.toEqual(new DefinitionLoadError(404));
  });

  it('the catalogue of a language is the published messages document: its texts are returned', async () => {
    const p = source.messages('en');
    const req = http.expectOne((r) => r.url === '/registry/apps/order%20management/documents/messages/en/published');
    expect(req.request.params.get('env')).toBe('production');
    req.flush({ schemaVersion: '1.0', messages: 'en', texts: { 'app.title': 'Hello' } }, { headers: { ETag: '"m1"' } });
    expect(await p).toEqual({ 'app.title': 'Hello' });
  });
});
