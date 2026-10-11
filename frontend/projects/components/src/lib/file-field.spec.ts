import type { NodeDefinition } from 'schema';
import { accepts } from './file-field.component';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('caricamento di file', () => {
  it('accept: estensioni, tipi esatti e famiglie di tipi', () => {
    const pdf = { name: 'Fattura.PDF', type: 'application/pdf' };
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
    fields: [{ name: 'allegato', type: 'file', label: 'Allegato', accept: '.pdf,image/*', maxSizeKb: 1, required: true, ...(upload ? { upload } : {}) }],
    actions: [{ label: 'Salva', onClick: [{ call: 'salva' }] }],
  });
  const dataSources = {
    carica: { type: 'rest' as const, method: 'POST' as const, url: '/api/allegati', body: '{{ file }}' },
    salva: { type: 'rest' as const, method: 'POST' as const, url: '/api/salva', body: '{{ form }}' },
  };
  const choose = (h: ScreenHarness, file: File): void => {
    const input = h.el.querySelector('lc-file-field input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));
  };
  const save = (h: ScreenHarness): void => ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Salva')) as HTMLButtonElement).click();
  const error = (h: ScreenHarness): string => plain(h.el.querySelector('lc-file-field .error')?.textContent);

  it('rifiuta tipo e dimensione prima di inviare; con upload il file parte in multipart e il valore è la risposta del servizio', async () => {
    const h = await renderScreen({ components: [form('carica')], dataSources, respond: (r) => (r.url === '/api/allegati' ? { id: 42 } : {}) });
    choose(h, new File(['x'], 'note.txt', { type: 'text/plain' }));
    await h.until(() => !!error(h), 'tipo rifiutato');
    expect(error(h)).toBe('Tipo di file non ammesso (ammessi: .pdf,image/*)');
    choose(h, new File(['x'.repeat(2048)], 'grande.pdf', { type: 'application/pdf' }));
    await h.until(() => error(h).startsWith('File troppo grande'), 'dimensione rifiutata');
    expect(error(h)).toBe('File troppo grande (massimo 1 KB)');
    expect(h.requests).toEqual([]);
    choose(h, new File(['ciao'], 'ok.pdf', { type: 'application/pdf' }));
    await h.until(() => plain(h.el.querySelector('lc-file-field .name')?.textContent) === 'ok.pdf', 'file caricato');
    expect(error(h)).toBe('');
    // Multipart: nel corpo solo i dati del file, il contenuto viaggia come file.
    expect(h.requests[0].body).toEqual({ name: 'ok.pdf', type: 'application/pdf', size: 4 });
    expect(h.requests[0].file?.name).toBe('ok.pdf');
    expect(await (h.requests[0].file?.blob as Blob).text()).toBe('ciao');
    save(h);
    await h.until(() => h.requests.length === 2, 'salvataggio');
    expect(h.requests[1].body).toEqual({ allegato: { id: 42, name: 'ok.pdf', type: 'application/pdf', size: 4 } });
  });

  it('senza upload il valore contiene il contenuto; il file si può togliere e allora è obbligatorio', async () => {
    const h = await renderScreen({ components: [form()], dataSources });
    choose(h, new File(['abc'], 'foto.png', { type: 'image/png' }));
    await h.until(() => !!h.el.querySelector('lc-file-field .name'), 'file scelto');
    expect(plain(h.el.querySelector('lc-file-field button')?.textContent)).toBe('Sostituisci');
    save(h);
    await h.until(() => h.requests.length === 1, 'salvataggio');
    expect(h.requests[0].body).toEqual({ allegato: { name: 'foto.png', type: 'image/png', size: 3, content: btoa('abc') } });
    const remove = h.el.querySelector('lc-file-field button[aria-label]') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Togli il file foto.png');
    remove.click();
    await h.settle();
    expect(h.el.querySelector('lc-file-field .name')).toBeNull();
    save(h);
    await h.settle();
    expect(plain(h.el.querySelector('.ant-form-item-explain-error')?.textContent)).toBe('Campo obbligatorio');
    expect(h.requests).toHaveLength(1);
  });

  it('con uploadAs base64 il contenuto viaggia nel corpo JSON, e oltre 10 MB non si accetta', async () => {
    const node: NodeDefinition = {
      type: 'form',
      fields: [{ name: 'allegato', type: 'file', upload: 'carica', uploadAs: 'base64', maxSizeKb: 102400 }],
    };
    const h = await renderScreen({ components: [node], dataSources, respond: () => ({ id: 1 }) });
    const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    choose(h, big);
    await h.until(() => error(h).startsWith('File troppo grande'), 'limite del base64');
    expect(error(h)).toBe('File troppo grande (massimo 10 MB)');
    choose(h, new File(['abc'], 'piccolo.pdf', { type: 'application/pdf' }));
    await h.until(() => h.requests.length === 1, 'invio');
    expect(h.requests[0].body).toEqual({ name: 'piccolo.pdf', type: 'application/pdf', size: 3, content: btoa('abc') });
    expect(h.requests[0].file).toBeUndefined();
  });
});
