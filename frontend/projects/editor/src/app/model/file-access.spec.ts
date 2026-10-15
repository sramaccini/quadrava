import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FileAccess, type FileHandle } from './file-access';
import { SavedDocuments } from './saved-documents';

/** Un file finto dell'API File System Access: tiene quello che vi si scrive. */
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

  it('senza API dei file «Salva» scarica il JSON con il nome proposto', async () => {
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

  it('con l’API dei file il primo «Salva» chiede dove, i successivi riscrivono lo stesso file', async () => {
    const handle = fakeHandle('mia.json');
    const picker = vi.fn(async () => handle);
    vi.stubGlobal('showSaveFilePicker', picker);
    const files = TestBed.inject(FileAccess);
    expect(await files.save('screen', { screen: 'a', title: 'Uno' }, 'a.json')).toBe('mia.json');
    expect(await files.save('screen', { screen: 'a', title: 'Due' }, 'a.json')).toBe('mia.json');
    expect(picker).toHaveBeenCalledTimes(1);
    expect(picker.mock.calls[0]).toEqual([expect.objectContaining({ suggestedName: 'a.json' })]);
    expect(JSON.parse(handle.written[1])).toEqual({ screen: 'a', title: 'Due' });
    expect(handle.written[1].endsWith('\n')).toBe(true);
    // Un altro tipo di documento ha il suo file; dimenticato il file, si richiede.
    files.forget('screen');
    await files.save('screen', { screen: 'a' }, 'a.json');
    expect(picker).toHaveBeenCalledTimes(2);
  });

  it('annullare la scelta del file non salva e non è un errore', async () => {
    vi.stubGlobal('showSaveFilePicker', async () => {
      throw new DOMException('annullato', 'AbortError');
    });
    expect(await TestBed.inject(FileAccess).save('theme', {}, 't.json')).toBeNull();
  });

  it('«Apri…» legge il JSON e tiene il file per il prossimo «Salva»', async () => {
    const handle = fakeHandle('ordini.json', '{"screen":"ordini","components":[]}');
    vi.stubGlobal('showOpenFilePicker', async () => [handle]);
    const save = vi.fn();
    vi.stubGlobal('showSaveFilePicker', save);
    const files = TestBed.inject(FileAccess);
    expect(await files.open('screen')).toEqual({ name: 'ordini.json', doc: { screen: 'ordini', components: [] } });
    await files.save('screen', { screen: 'ordini' }, 'ordini.json');
    expect(save).not.toHaveBeenCalled();
    expect(JSON.parse(handle.written[0])).toEqual({ screen: 'ordini' });
  });

  it('un file che non è JSON dà un errore e non diventa il file del documento', async () => {
    vi.stubGlobal('showOpenFilePicker', async () => [fakeHandle('rotto.json', 'non json')]);
    const files = TestBed.inject(FileAccess);
    await expect(files.open('screen')).rejects.toThrow();
    expect(files.fileName('screen')).toBeNull();
  });
});

describe('SavedDocuments', () => {
  beforeEach(() => localStorage.clear());

  it('ricorda l’ultimo contenuto salvato per tipo, anche dopo una ricarica', () => {
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
