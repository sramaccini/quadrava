import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Project } from './project';
import { MemoryFolder } from './project-folder';
import { ProjectPublisher } from './project-publisher';

describe('ProjectPublisher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes every resource of the project in order, catalogues as messages documents; reports what was not published', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push(`${method} ${url.replace('/registry/apps/shop/documents/', '')}`);
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) });
      if (method === 'GET' && url.endsWith('/versions')) return url.includes('/screen/') ? json([{ hash: 'old', createdAt: '', author: 'a', state: 'approved' }]) : json({ title: 'Not found' }, 404);
      if (method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.theme === 'broken') return json({ title: 'Invalid document', errors: [{ path: '/tokens', message: 'missing' }] }, 400);
        return json({ hash: `h-${calls.length}`, createdAt: '', author: 'a', state: 'draft' }, 201);
      }
      if (method === 'PUT') return url.includes('/navigation/') ? json({ title: 'Only approved versions' }, 409) : json(null, 204);
      return json({}, 404);
    });
    const project = TestBed.inject(Project);
    await project.open(
      new MemoryFolder('shop', {
        'project.json': JSON.stringify({ schemaVersion: '1.0', project: 'shop', name: 'Shop', languages: ['en'], defaultLanguage: 'en' }),
        'navigation.json': JSON.stringify({ schemaVersion: '1.0', navigation: 'main', areas: [] }),
        'screens/orders.json': JSON.stringify({ schemaVersion: '1.0', screen: 'orders', components: [] }),
        'datasources/orders.json': JSON.stringify({ schemaVersion: '1.0', datasources: 'orders', sources: { list: { type: 'rest', method: 'GET', url: '/api' } } }),
        'themes/broken.json': JSON.stringify({ schemaVersion: '1.0', theme: 'broken' }),
        'i18n/en.json': JSON.stringify({ hello: 'Hello' }),
      }),
    );
    const report = await TestBed.inject(ProjectPublisher).publish('shop', 'development');
    // Data sources before the screens, the navigation last; the manifest is not a registry document.
    expect(calls.filter((c) => c.startsWith('POST')).map((c) => c.split(' ')[1])).toEqual([
      'datasources/orders/versions',
      'screen/orders/versions',
      'theme/broken/versions',
      'messages/en/versions',
      'navigation/main/versions',
    ]);
    expect(report.saved).toEqual(['datasources/orders.json', 'screens/orders.json', 'i18n/en.json', 'navigation.json']);
    expect(report.published).toEqual(['datasources/orders.json', 'screens/orders.json', 'i18n/en.json']);
    expect(report.failed.map((f) => [f.path, f.status])).toEqual([
      ['themes/broken.json', 400],
      ['navigation.json', 409],
    ]);
  });
});
