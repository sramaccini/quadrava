import { DataClient, type DataRequest, type DataRequestOptions } from 'core';
import type { NodeDefinition } from 'schema';
import { accepts } from './file-field.component';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('file upload', () => {
  it('accept: extensions, exact types and type families', () => {
    const pdf = { name: 'Invoice.PDF', type: 'application/pdf' };
    const png = { name: 'logo.png', type: 'image/png' };
    expect(accepts(undefined, pdf)).toBe(true);
    expect(accepts('.pdf', pdf)).toBe(true);
    expect(accepts('.pdf', png)).toBe(false);
    expect(accepts('image/*', png)).toBe(true);
    expect(accepts('image/*, application/pdf', pdf)).toBe(true);
    expect(accepts('application/zip', pdf)).toBe(false);
  });

  const form = (upload?: string): NodeDefinition => ({
    type: 'form',
    fields: [{ name: 'attachment', type: 'file', label: 'Attachment', accept: '.pdf,image/*', maxSizeKb: 1, required: true, ...(upload ? { upload } : {}) }],
    actions: [{ label: 'Save', onClick: [{ call: 'save' }] }],
  });
  const dataSources = {
    store: { type: 'rest' as const, method: 'POST' as const, url: '/api/attachments', body: '{{ file }}' },
    save: { type: 'rest' as const, method: 'POST' as const, url: '/api/save', body: '{{ form }}' },
  };
  const choose = (h: ScreenHarness, file: File): void => {
    const input = h.el.querySelector('lc-file-field input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
  };
  const save = (h: ScreenHarness): void => ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Save')) as HTMLButtonElement).click();
  const error = (h: ScreenHarness): string => plain(h.el.querySelector('lc-file-field .error')?.textContent);

  it('rejects type and size before sending; with upload the file goes as multipart and the value is the service response', async () => {
    const h = await renderScreen({ components: [form('store')], dataSources, respond: (r) => (r.url === '/api/attachments' ? { id: 42 } : {}) });
    choose(h, new File(['x'], 'note.txt', { type: 'text/plain' }));
    await h.until(() => !!error(h), 'type rejected');
    expect(error(h)).toBe('File type not allowed (allowed: .pdf,image/*)');
    choose(h, new File(['x'.repeat(2048)], 'large.pdf', { type: 'application/pdf' }));
    await h.until(() => error(h).startsWith('File too large'), 'size rejected');
    expect(error(h)).toBe('File too large (maximum 1 KB)');
    expect(h.requests).toEqual([]);
    choose(h, new File(['test'], 'ok.pdf', { type: 'application/pdf' }));
    await h.until(() => plain(h.el.querySelector('lc-file-field .name')?.textContent) === 'ok.pdf', 'file uploaded');
    expect(error(h)).toBe('');
    // Multipart: only the file data in the body, the content travels as a file.
    expect(h.requests[0].body).toEqual({ name: 'ok.pdf', type: 'application/pdf', size: 4 });
    expect(h.requests[0].file?.name).toBe('ok.pdf');
    expect(await (h.requests[0].file?.blob as Blob).text()).toBe('test');
    save(h);
    await h.until(() => h.requests.length === 2, 'saving');
    expect(h.requests[1].body).toEqual({ attachment: { id: 42, name: 'ok.pdf', type: 'application/pdf', size: 4 } });
  });

  it('without upload the value holds the content; the file can be removed and then it is required', async () => {
    const h = await renderScreen({ components: [form()], dataSources });
    choose(h, new File(['abc'], 'photo.png', { type: 'image/png' }));
    await h.until(() => !!h.el.querySelector('lc-file-field .name'), 'file chosen');
    expect(plain(h.el.querySelector('lc-file-field button')?.textContent)).toBe('Replace');
    save(h);
    await h.until(() => h.requests.length === 1, 'saving');
    expect(h.requests[0].body).toEqual({ attachment: { name: 'photo.png', type: 'image/png', size: 3, content: btoa('abc') } });
    const remove = h.el.querySelector('lc-file-field button[aria-label]') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Remove the file photo.png');
    remove.click();
    await h.settle();
    expect(h.el.querySelector('lc-file-field .name')).toBeNull();
    save(h);
    await h.settle();
    expect(plain(h.el.querySelector('.ant-form-item-explain-error')?.textContent)).toBe('Required field');
    expect(h.requests).toHaveLength(1);
  });

  it('with uploadAs base64 the content travels in the JSON body, and above 10 MB it is not accepted', async () => {
    const node: NodeDefinition = {
      type: 'form',
      fields: [{ name: 'attachment', type: 'file', upload: 'store', uploadAs: 'base64', maxSizeKb: 102400 }],
    };
    const h = await renderScreen({ components: [node], dataSources, respond: () => ({ id: 1 }) });
    const big = new File(['x'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    choose(h, big);
    await h.until(() => error(h).startsWith('File too large'), 'base64 limit');
    expect(error(h)).toBe('File too large (maximum 10 MB)');
    choose(h, new File(['abc'], 'small.pdf', { type: 'application/pdf' }));
    await h.until(() => h.requests.length === 1, 'sending');
    expect(h.requests[0].body).toEqual({ name: 'small.pdf', type: 'application/pdf', size: 3, content: btoa('abc') });
    expect(h.requests[0].file).toBeUndefined();
  });

  describe('as a drop zone', () => {
    const attachments: NodeDefinition = {
      type: 'input',
      field: { name: 'attachment', type: 'file', label: 'Add attachment', display: 'dropzone', hint: 'Up to {{ 1 }} KB per file', accept: '.pdf', maxSizeKb: 1, upload: 'store' },
    } as NodeDefinition;
    const zone = (h: ScreenHarness): HTMLElement => h.el.querySelector('lc-file-field .zone')!;
    /** A drag event with files, as the browser sends it (jsdom has no DataTransfer). */
    const drag = (type: string, files: File[]): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
      return event;
    };

    it('the label is the text of the button in the middle, with the hint under it; no label above', async () => {
      const h = await renderScreen({ components: [attachments], dataSources });
      const button = zone(h).querySelector('button')!;
      expect(plain(button.textContent)).toBe('Add attachment');
      expect(h.el.querySelector('lc-input nz-form-label')).toBeNull();
      const hint = zone(h).querySelector('.hint')!;
      expect(plain(hint.textContent)).toBe('Up to 1 KB per file');
      expect(button.getAttribute('aria-describedby')).toBe(hint.id);
      expect(zone(h).querySelector('input[type="file"]')?.getAttribute('aria-label')).toBe('Add attachment');
      expect(h.reports).toEqual([]);
    });

    it('a dropped file is checked and uploaded like a chosen one; the area is highlighted while a file is over it', async () => {
      const h = await renderScreen({ components: [attachments], dataSources, respond: () => ({ id: 7 }) });
      const over = drag('dragover', []);
      zone(h).dispatchEvent(over);
      await h.settle();
      expect(over.defaultPrevented).toBe(true);
      expect(zone(h).classList.contains('over')).toBe(true);
      zone(h).dispatchEvent(drag('drop', [new File(['x'], 'notes.txt', { type: 'text/plain' })]));
      await h.until(() => !!error(h), 'type rejected');
      expect(zone(h).classList.contains('over')).toBe(false);
      expect(h.requests).toEqual([]);
      zone(h).dispatchEvent(drag('drop', [new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })]));
      await h.until(() => plain(h.el.querySelector('lc-file-field .name')?.textContent) === 'spec.pdf', 'uploaded');
      expect(h.requests[0].file?.name).toBe('spec.pdf');
      expect(error(h)).toBe('');
    });

    it('a disabled field does not take dropped files', async () => {
      const h = await renderScreen({ components: [{ ...attachments, enabledIf: '{{ false }}' } as NodeDefinition], dataSources });
      const over = drag('dragover', []);
      zone(h).dispatchEvent(over);
      expect(over.defaultPrevented).toBe(false);
      zone(h).dispatchEvent(drag('drop', [new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })]));
      await h.settle();
      expect(h.requests).toEqual([]);
    });
  });
  describe('several files', () => {
    const many = (extra: Record<string, unknown> = {}): NodeDefinition =>
      ({
        type: 'input',
        field: { name: 'files', type: 'file', label: 'Add files', display: 'dropzone', multiple: true, accept: '.pdf', maxSizeKb: 1, upload: 'store', ...extra },
      }) as NodeDefinition;
    const rows = (h: ScreenHarness): string[] =>
      [...h.el.querySelectorAll('lc-file-field .files li')].map((li) => [...li.children].map((part) => plain(part.textContent)).filter(Boolean).join(' '));
    const pdf = (name: string): File => new File(['pdf'], name, { type: 'application/pdf' });

    it('each file is checked and uploaded on its own; a wrong one stays with its error until removed', async () => {
      const h = await renderScreen({ components: [many()], dataSources, respond: (r) => ({ id: (r.file?.name ?? '').length }) });
      choose(h, pdf('a.pdf'));
      await h.until(() => rows(h).length === 1 && !h.el.querySelector('progress'), 'first uploaded');
      const input = h.el.querySelector('lc-file-field input[type="file"]') as HTMLInputElement;
      expect(input.multiple).toBe(true);
      Object.defineProperty(input, 'files', { configurable: true, value: [pdf('bb.pdf'), new File(['x'], 'notes.txt', { type: 'text/plain' }), pdf('ccc.pdf')] });
      input.dispatchEvent(new Event('change'));
      await h.until(() => h.requests.length === 3 && !h.el.querySelector('progress'), 'the others uploaded');
      expect(h.requests.map((r) => r.file?.name)).toEqual(['a.pdf', 'bb.pdf', 'ccc.pdf']);
      expect(rows(h)).toEqual(['a.pdf 0.1 KB', 'bb.pdf 0.1 KB', 'ccc.pdf 0.1 KB', 'notes.txt 0.1 KB File type not allowed (allowed: .pdf)']);
      const failed = h.el.querySelector('lc-file-field li.failed button') as HTMLButtonElement;
      expect(failed.getAttribute('aria-label')).toBe('Remove notes.txt from the list');
      failed.click();
      (h.el.querySelector('lc-file-field li button') as HTMLButtonElement).click();
      await h.until(() => rows(h).length === 2, 'removed');
      expect(rows(h)).toEqual(['bb.pdf 0.1 KB', 'ccc.pdf 0.1 KB']);
      expect(h.reports).toEqual([]);
    });

    it('beyond maxItems no file is taken', async () => {
      const h = await renderScreen({ components: [many({ maxItems: 2 })], dataSources });
      const input = h.el.querySelector('lc-file-field input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')] });
      input.dispatchEvent(new Event('change'));
      await h.until(() => !!error(h), 'the message');
      expect(error(h)).toBe('Too many files (maximum 2)');
      expect(h.requests).toEqual([]);
    });

    it('a bar shows the progress the client reports, and the failure of a file', async () => {
      let report: ((sent: number, total: number) => void) | undefined;
      let finish: ((ok: boolean) => void) | undefined;
      const client = {
        request: (_: DataRequest, options?: DataRequestOptions) =>
          new Promise((resolve, reject) => {
            report = options?.onProgress;
            finish = (ok) => (ok ? resolve({}) : reject(new Error('500')));
          }),
      };
      const h = await renderScreen({ components: [many()], dataSources, extraProviders: [{ provide: DataClient, useValue: client }] });
      choose(h, pdf('a.pdf'));
      await h.until(() => !!h.el.querySelector('progress'), 'the bar');
      const bar = h.el.querySelector('progress')!;
      expect(bar.hasAttribute('value')).toBe(false);
      expect(bar.getAttribute('aria-label')).toBe('Uploading a.pdf');
      report!(30, 120);
      await h.until(() => h.el.querySelector('progress')?.getAttribute('value') === '0.25', 'a quarter');
      finish!(false);
      await h.until(() => rows(h)[0]?.includes('File upload failed'), 'the error of the file');
    });
  });
});
