import type { NodeDefinition } from 'schema';
import { safeImageSrc } from './display.component';
import { plain, renderScreen } from './screen-testing';

describe('immagine, link, avanzamento, timeline e kanban', () => {
  it('indirizzi delle immagini: solo relativi, https o data:image', () => {
    for (const ok of ['/img/logo.png', 'logo.svg', 'img/a b.png'.replace(' ', '-'), 'https://cdn.example.com/x.png', 'data:image/png;base64,iVBORw0KGgo=']) {
      expect(safeImageSrc(ok), ok).toBe(ok);
    }
    for (const bad of ['javascript:alert(1)', 'http://x.test/a.png', '//evil.test/a.png', '/../segreto.png', 'file:///c:/x.png', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:x', ' JAVASCRIPT:x']) {
      expect(safeImageSrc(bad), bad).toBeNull();
    }
  });

  it('immagine: testo alternativo; indirizzo non ammesso o non caricato → solo il testo', async () => {
    const h = await renderScreen({
      components: [
        { type: 'image', src: "/img/{{ 'logo' }}.png", alt: 'Logo', width: 120 },
        { type: 'image', src: 'javascript:alert(1)', alt: 'Bloccata' },
      ],
    });
    const img = h.el.querySelector('lc-image img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/img/logo.png');
    expect(img.alt).toBe('Logo');
    expect(img.style.maxWidth).toBe('120px');
    const blocked = h.el.querySelectorAll('lc-image')[1];
    expect(blocked.querySelector('img')).toBeNull();
    expect(blocked.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Bloccata');
    img.dispatchEvent(new Event('error'));
    await h.settle();
    expect(h.el.querySelector('lc-image .missing')?.textContent?.trim()).toBe('Logo');
  });

  it('link: a una schermata con parametri, a un indirizzo esterno in una nuova scheda senza accesso a questa', async () => {
    const h = await renderScreen({
      components: [
        { type: 'link', label: 'Apri l’ordine {{ 7 }}', screen: 'ordine-dettaglio', params: { id: '{{ 7 }}' } },
        { type: 'link', label: 'Documentazione', href: 'https://example.com/doc' },
        { type: 'link', label: 'Interno', href: '/vetrina/vetrina-base' },
      ],
    });
    (h.el.querySelector('lc-link button') as HTMLButtonElement).click();
    await h.settle();
    expect(h.navigations).toEqual([{ screen: 'ordine-dettaglio', params: { id: 7 } }]);
    const [external, internal] = [...h.el.querySelectorAll<HTMLAnchorElement>('lc-link a')];
    expect([external.getAttribute('href'), external.target, external.rel]).toEqual(['https://example.com/doc', '_blank', 'noopener noreferrer']);
    expect([internal.getAttribute('href'), internal.target]).toEqual(['/vetrina/vetrina-base', '']);
  });

  it('avanzamento: percentuale limitata tra 0 e 100, valore non numerico → trattino', async () => {
    const h = await renderScreen({
      components: [
        { type: 'progress', value: '{{ 3 }}', max: 4, label: 'Passi completati' },
        { type: 'progress', value: 250 },
        { type: 'progress', value: '{{ "abc" }}' },
      ],
    });
    const bars = [...h.el.querySelectorAll('lc-progress')];
    expect(bars[0].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('75');
    expect(plain(bars[0].querySelector('.label')?.textContent)).toBe('Passi completati');
    expect(bars[1].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(plain(bars[2].textContent)).toBe('—');
  });

  it('timeline: eventi dal più recente, con data, descrizione e colore; righe senza data escluse', async () => {
    const h = await renderScreen({
      components: [
        { type: 'timeline', source: 'eventi', dateField: 'data', labelField: 'titolo', descriptionField: 'nota', toneField: 'esito', tones: { ko: 'danger' } },
      ],
      dataSources: { eventi: { type: 'rest', method: 'GET', url: '/api/eventi' } },
      respond: () => [
        { data: '2026-10-01', titolo: 'Creata', nota: 'da Anna' },
        { data: '2026-10-05', titolo: 'Respinta', esito: 'ko' },
        { data: 'mai', titolo: 'Senza data' },
      ],
    });
    // NG-ZORRO disegna il contenuto delle voci altrove nel suo albero: si legge dentro lc-timeline.
    await h.until(() => h.el.querySelectorAll('lc-timeline .title').length === 2, 'eventi');
    expect([...h.el.querySelectorAll('lc-timeline .title')].map((t) => plain(t.textContent))).toEqual(['Respinta', 'Creata']);
    expect([...h.el.querySelectorAll('lc-timeline time')].map((t) => t.getAttribute('datetime'))).toEqual(['2026-10-05', '2026-10-01']);
    expect([...h.el.querySelectorAll('lc-timeline .description')].map((d) => plain(d.textContent))).toEqual(['da Anna']);
  });

  describe('kanban', () => {
    const kanban = (extra: Partial<Record<string, unknown>> = {}): NodeDefinition =>
      ({
        type: 'kanban',
        source: 'attivita',
        columnField: 'stato',
        titleField: 'titolo',
        descriptionField: 'chi',
        columns: [
          { value: 'da-fare', label: 'Da fare' },
          { value: 'in-corso', label: 'In corso', tone: 'primary' },
          { value: 'fatto', label: 'Fatto', tone: 'success' },
        ],
        onMove: [{ call: 'sposta', args: { id: '{{ row.id }}', stato: '{{ to }}' } }, { toast: '{{ from }} → {{ to }}' }],
        ...extra,
      }) as NodeDefinition;
    const dataSources = {
      attivita: { type: 'rest' as const, method: 'GET' as const, url: '/api/attivita' },
      sposta: { type: 'rest' as const, method: 'POST' as const, url: '/api/attivita/{{ id }}/sposta' },
    };
    const rows = [
      { id: 1, titolo: 'Preventivo', chi: 'Anna', stato: 'da-fare' },
      { id: 2, titolo: 'Fattura', chi: 'Luca', stato: 'in-corso' },
      { id: 3, titolo: 'Archiviata', stato: 'altro' },
    ];
    const column = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLElement>('lc-kanban section')].find((s) => s.getAttribute('aria-label') === label)!;

    it('schede nelle colonne secondo il campo, con conteggio; valori fuori colonna esclusi', async () => {
      const h = await renderScreen({ components: [kanban()], dataSources, respond: (r) => (r.method === 'GET' ? rows : {}) });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 2, 'schede');
      expect([...h.el.querySelectorAll('lc-kanban h3')].map((x) => plain(x.textContent))).toEqual(['Da fare 1', 'In corso 1', 'Fatto 0']);
      expect(plain(column(h.el, 'Da fare').querySelector('.card')?.textContent)).toBe('Preventivo Anna');
    });

    it('trascinare una scheda in un’altra colonna esegue onMove con row, from e to', async () => {
      const h = await renderScreen({ components: [kanban()], dataSources, respond: (r) => (r.method === 'GET' ? rows : {}) });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 2, 'schede');
      const card = column(h.el, 'Da fare').querySelector('.card') as HTMLElement;
      expect(card.getAttribute('draggable')).toBe('true');
      const data = { setData: () => undefined, effectAllowed: '' } as unknown as DataTransfer;
      const drag = (type: string, target: Element) => {
        const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
        Object.defineProperty(event, 'dataTransfer', { value: data });
        target.dispatchEvent(event);
      };
      drag('dragstart', card);
      drag('dragover', column(h.el, 'Fatto'));
      await h.settle();
      expect(column(h.el, 'Fatto').classList).toContain('over');
      drag('drop', column(h.el, 'Fatto'));
      await h.until(() => h.toasts.length === 1, 'spostata');
      expect(h.requests.find((r) => r.method === 'POST')).toEqual({ method: 'POST', url: '/api/attivita/1/sposta', body: {} });
      expect(h.toasts).toEqual(['da-fare → fatto']);
    });

    it('senza onMove o con moveIf falso (o in errore) le schede non si spostano', async () => {
      const h = await renderScreen({
        components: [kanban({ moveIf: "{{ row.chi == 'Anna' }}" })],
        dataSources,
        respond: (r) => (r.method === 'GET' ? rows : {}),
      });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 2, 'schede');
      expect([...h.el.querySelectorAll('lc-kanban .card')].map((c) => c.getAttribute('draggable'))).toEqual(['true', 'false']);
      // Il menu «Sposta in» c'è solo dove si può spostare, con un nome comprensibile.
      const buttons = [...h.el.querySelectorAll('lc-kanban .card button')];
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Sposta «Preventivo» in…']);
    });
  });
});
