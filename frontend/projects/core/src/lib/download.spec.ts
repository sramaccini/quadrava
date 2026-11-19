import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition } from 'schema';
import { vi } from 'vitest';
import { runSteps } from './action-engine';
import { fileNameFromDisposition, lastPathSegment, safeFileName } from './download';
import { Fakes } from './testing';

/** Error like the one of the services data client: with the HTTP code and without the server text. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Request failed (${status})`);
  }
}

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'test',
  dataSources: {
    exportUser: { type: 'rest', method: 'GET', url: '/api/admin/users/{{ username }}/export' },
    save: { type: 'rest', method: 'PUT', url: '/api/users/{{ username }}' },
  },
  components: [],
};

describe('file names', () => {
  it('Content-Disposition: filename* in UTF-8 wins, then filename quoted or not', () => {
    expect(fileNameFromDisposition("attachment; filename=\"plain.json\"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf")).toBe('résumé.pdf');
    expect(fileNameFromDisposition('attachment; filename="with \\"quotes\\".txt"')).toBe('with "quotes".txt');
    expect(fileNameFromDisposition('attachment; filename=report.csv')).toBe('report.csv');
    // An encoding that cannot be read, or another charset: the plain name.
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E0%A4; filename=fallback.txt")).toBe('fallback.txt');
    expect(fileNameFromDisposition("attachment; filename*=iso-8859-1''x.txt; filename=y.txt")).toBe('y.txt');
    expect(fileNameFromDisposition('attachment')).toBeUndefined();
    expect(fileNameFromDisposition(null)).toBeUndefined();
  });

  it('a safe name has no folders, no forbidden characters and no dots at the ends', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\x\\a.txt')).toBe('a.txt');
    expect(safeFileName('a<b>:c"|?*.txt')).toBe('abc.txt');
    expect(safeFileName(' .hidden. ')).toBe('hidden');
    expect(safeFileName('line\nbreak.txt')).toBe('linebreak.txt');
    expect(safeFileName('x'.repeat(200))).toHaveLength(150);
    expect(safeFileName('...')).toBeUndefined();
    expect(safeFileName('')).toBeUndefined();
  });

  it('the last segment of the address, without query and decoded', () => {
    expect(lastPathSegment('/api/admin/users/ada/export?full=1')).toBe('export');
    expect(lastPathSegment('/api/files/my%20notes.txt')).toBe('my notes.txt');
    expect(lastPathSegment('/')).toBeUndefined();
  });
});

describe('download step', () => {
  let fakes: Fakes;
  let injector: Injector;
  let saved: { name: string; blob: Blob }[];
  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
    saved = [];
    let last: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => ((last = blob as Blob), 'blob:x'));
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: last as Blob });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('saves the file of the data source with the name of the service, and tells screen readers', async () => {
    vi.useFakeTimers();
    fakes.respond = () => ({ blob: new Blob(['{"username":"ada"}'], { type: 'application/json' }), fileName: '../ada.json' });
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ download: 'exportUser', args: { username: 'ada' }, fileName: 'ignored.json' }, { toast: 'after' }])).toBe(true);
    expect(fakes.requests.at(-1)).toMatchObject({ method: 'GET', url: '/api/admin/users/ada/export' });
    expect(fakes.requestOptions.at(-1)).toMatchObject({ source: 'exportUser', download: true });
    expect(saved.map((s) => s.name)).toEqual(['ada.json']);
    expect(saved[0].blob.type).toBe('application/json');
    vi.advanceTimersByTime(100);
    expect(document.getElementById('lc-download-status')?.textContent).toBe('Download started');
    expect(fakes.toasts.map((t) => t.message)).toEqual(['after']);
    vi.useRealTimers();
    rt.destroy();
  });

  it('without a name from the service: fileName with its expressions, then the end of the address', async () => {
    fakes.respond = () => ({ blob: new Blob(['x']) });
    const rt = fakes.runtime(screen, injector);
    await runSteps(rt, [{ download: 'exportUser', args: { username: 'ada' }, fileName: 'user-{{ username }}.json' }], { username: 'ada' });
    await runSteps(rt, [{ download: 'exportUser', args: { username: 'ada' } }]);
    expect(saved.map((s) => s.name)).toEqual(['user-ada.json', 'export']);
    rt.destroy();
  });

  it('a data client that does not know downloads answers with data: saved as JSON', async () => {
    fakes.respond = () => ({ username: 'ada' });
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ download: 'exportUser', args: { username: 'ada' } }])).toBe(true);
    expect(saved[0].blob.type).toBe('application/json');
    expect(await saved[0].blob.text()).toBe('{"username":"ada"}');
    rt.destroy();
  });

  it('a failure runs onError with error.status, or the default message; a non-GET data source is refused', async () => {
    fakes.respond = () => {
      throw new HttpError(404);
    };
    const rt = fakes.runtime(screen, injector);
    expect(await runSteps(rt, [{ download: 'exportUser', args: { username: 'x' }, onError: { toast: 'Error {{ error.status }}' } }])).toBe(false);
    expect(await runSteps(rt, [{ download: 'exportUser', args: { username: 'x' } }])).toBe(false);
    expect(fakes.toasts.map((t) => t.message)).toEqual(['Error 404', 'Operation failed']);
    expect(await runSteps(rt, [{ download: 'save', args: { username: 'x' } }])).toBe(false);
    expect(fakes.reports.at(-1)?.error).toBe('a download needs a GET data source');
    expect(saved).toEqual([]);
    rt.destroy();
  });
});

describe('a 401 is handled by the session', () => {
  it('call and download stop without onError and without a message of their own', async () => {
    const fakes = new Fakes();
    const rt = fakes.runtime(screen, TestBed.inject(Injector));
    fakes.respond = () => {
      throw new HttpError(401);
    };
    const onError = { toast: 'Saving failed' };
    expect(await runSteps(rt, [{ call: 'save', args: { username: 'ada' }, onError }, { toast: 'not reached' }])).toBe(false);
    expect(await runSteps(rt, [{ call: 'save', args: { username: 'ada' } }])).toBe(false);
    expect(await runSteps(rt, [{ download: 'exportUser', args: { username: 'ada' }, onError }])).toBe(false);
    expect(fakes.toasts).toEqual([]);
    rt.destroy();
  });
});
