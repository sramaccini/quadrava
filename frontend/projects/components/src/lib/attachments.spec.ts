import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('attachments: image cells and the preview step', () => {
  const dataSources = { files: { type: 'rest' as const, method: 'GET' as const, url: '/api/files' } };
  const files = [
    { url: '/files/1/plan.png', name: 'plan.png', type: 'image/png' },
    { url: '/files/2', name: 'data.zip', type: 'application/zip' },
    { url: '/files/3', name: 'quote.pdf', type: 'application/pdf' },
    { url: 'javascript:alert(1)', name: 'evil.png', type: 'image/png' },
  ];
  const table: NodeDefinition = {
    type: 'table',
    source: 'files',
    columns: [
      { field: 'url', label: 'Preview', format: 'image' },
      { field: 'name', label: 'Name' },
    ],
    rowActions: [{ label: 'Open', onClick: [{ preview: { source: 'files', start: '{{ row.url }}' } }] }],
  } as NodeDefinition;
  const respond = (r: { url: string }): unknown => (r.url === '/files/3' ? { blob: new Blob(['%PDF-1.4']), fileName: 'quote.pdf' } : files);
  const window = (): HTMLElement | null => document.querySelector('lc-file-preview');
  const open = (h: ScreenHarness, row: number): void => {
    const buttons = [...h.el.querySelectorAll('tbody tr')][row].querySelectorAll<HTMLButtonElement>('button');
    [...buttons].find((b) => plain(b.textContent) === 'Open')!.click();
  };

  beforeEach(() => vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:pdf'));
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  it('an image cell draws a small picture named after the file; an address not allowed draws nothing', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond });
    await h.until(() => h.el.querySelectorAll('tbody tr').length === 4, 'rows');
    const pictures = [...h.el.querySelectorAll<HTMLImageElement>('tbody img')];
    expect(pictures.map((img) => [img.getAttribute('src'), img.alt])).toEqual([
      ['/files/1/plan.png', 'plan.png'],
      ['/files/2', '2'],
      ['/files/3', '3'],
    ]);
    expect(h.reports).toEqual([]);
  });

  it('the preview starts from the row, moves among images and PDFs only, and reads a PDF as a PDF', async () => {
    const h = await renderScreen({ components: [table], dataSources, respond });
    await h.until(() => h.el.querySelectorAll('tbody tr').length === 4, 'rows');
    open(h, 2);
    await h.until(() => !!window(), 'the window');
    expect(plain(window()!.querySelector('h2')?.textContent)).toBe('quote.pdf');
    expect(plain(window()!.querySelector('.position')?.textContent)).toBe('2 of 2');
    await h.until(() => window()!.querySelector('iframe')?.getAttribute('src') === 'blob:pdf', 'the PDF in its frame');
    const read = h.requests.find((r) => r.url === '/files/3')!;
    expect(read.method).toBe('GET');
    const copy = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(copy.type).toBe('application/pdf');

    window()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await h.until(() => plain(window()!.querySelector('h2')?.textContent) === 'plan.png', 'round to the first');
    expect(window()!.querySelector('.stage img')?.getAttribute('src')).toBe('/files/1/plan.png');
    expect(window()!.querySelector('a[download]')?.getAttribute('href')).toBe('/files/1/plan.png');
    expect(h.reports).toEqual([]);
  });

  it('a source without images or PDFs is reported and opens nothing', async () => {
    const h = await renderScreen({
      components: [{ type: 'button', label: 'See', onClick: [{ preview: { source: 'files' } }, { toast: 'after' }] }],
      dataSources,
      respond: () => [{ url: '/files/2', name: 'data.zip' }],
    });
    await h.settle();
    [...h.el.querySelectorAll('button')].find((b) => plain(b.textContent) === 'See')!.click();
    await h.until(() => h.reports.length === 1, 'the report');
    expect(h.reports[0].source).toBe('preview files');
    expect(h.toasts).toEqual([]);
    expect(window()).toBeNull();
  });
});
