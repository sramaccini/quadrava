import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FileAccess, type FileHandle } from './file-access';
import { SavedDocuments } from './saved-documents';

/** A fake file of the File System Access API: it keeps what is written to it. */
function fakeHandle(name: string, content = ''): FileHandle & { written: string[] } {
  const written: string[] = [];
  return {
    name,
    written,
    getFile: async () => new File([content], name, { type: 'application/json' }),
    createWritable: async () => ({ write: async (blob: Blob) => void written.push(await blob.text()), close: async () => undefined }),
  };
}

describe('FileAccess', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('without the file API «Save» downloads the JSON with the proposed name', async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    URL.createObjectURL ??= () => 'blob:x';
    URL.revokeObjectURL ??= () => undefined;
    const files = TestBed.inject(FileAccess);
    expect(files.canWriteFiles()).toBe(false);
    expect(await files.save('screen', { screen: 'a' }, 'a.json')).toBe('a.json');
    expect(clicks).toEqual(['a.json']);
    expect(files.fileName('screen')).toBeNull();
  });

  it('with the file API the first «Save» asks where, the next ones rewrite the same file', async () => {
    const handle = fakeHandle('mine.json');
    const picker = vi.fn(async () => handle);
    vi.stubGlobal('showSaveFilePicker', picker);
    const files = TestBed.inject(FileAccess);
    expect(await files.save('screen', { screen: 'a', title: 'One' }, 'a.json')).toBe('mine.json');
    expect(await files.save('screen', { screen: 'a', title: 'Two' }, 'a.json')).toBe('mine.json');
    expect(picker).toHaveBeenCalledTimes(1);
    expect(picker.mock.calls[0]).toEqual([expect.objectContaining({ suggestedName: 'a.json' })]);
    expect(JSON.parse(handle.written[1])).toEqual({ screen: 'a', title: 'Two' });
    expect(handle.written[1].endsWith('\n')).toBe(true);
    // Another kind of document has its own file; once the file is forgotten, it is asked again.
    files.forget('screen');
    await files.save('screen', { screen: 'a' }, 'a.json');
    expect(picker).toHaveBeenCalledTimes(2);
  });

  it('cancelling the choice of the file does not save and is not an error', async () => {
    vi.stubGlobal('showSaveFilePicker', async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    expect(await TestBed.inject(FileAccess).save('theme', {}, 't.json')).toBeNull();
  });

  it('«Open…» reads the JSON and keeps the file for the next «Save»', async () => {
    const handle = fakeHandle('orders.json', '{"screen":"orders","components":[]}');
    vi.stubGlobal('showOpenFilePicker', async () => [handle]);
    const save = vi.fn();
    vi.stubGlobal('showSaveFilePicker', save);
    const files = TestBed.inject(FileAccess);
    expect(await files.open('screen')).toEqual({ name: 'orders.json', doc: { screen: 'orders', components: [] } });
    await files.save('screen', { screen: 'orders' }, 'orders.json');
    expect(save).not.toHaveBeenCalled();
    expect(JSON.parse(handle.written[0])).toEqual({ screen: 'orders' });
  });

  it('a file that is not JSON gives an error and does not become the file of the document', async () => {
    vi.stubGlobal('showOpenFilePicker', async () => [fakeHandle('broken.json', 'not json')]);
    const files = TestBed.inject(FileAccess);
    await expect(files.open('screen')).rejects.toThrow();
    expect(files.fileName('screen')).toBeNull();
  });
});

describe('SavedDocuments', () => {
  beforeEach(() => localStorage.clear());

  it('remembers the last saved content per kind, also after a reload', () => {
    const saved = TestBed.inject(SavedDocuments);
    saved.ensureBaseline('screen', { screen: 'a' });
    expect(saved.isSaved('screen', { screen: 'a' })).toBe(true);
    expect(saved.isSaved('screen', { screen: 'b' })).toBe(false);
    saved.ensureBaseline('screen', { screen: 'b' });
    expect(saved.isSaved('screen', { screen: 'b' })).toBe(false);
    saved.markSaved('screen', { screen: 'b' });
    expect(JSON.parse(localStorage.getItem('lc.editor.saved')!)).toEqual({ screen: '{"screen":"b"}' });
  });
});
