import type { NodeDefinition } from 'schema';
import { safeImageSrc } from './display.component';
import { plain, renderScreen } from './screen-testing';

describe('image, link, progress, timeline and kanban', () => {
  it('image addresses: only relative, https or data:image', () => {
    for (const ok of ['/img/logo.png', 'logo.svg', 'img/a b.png'.replace(' ', '-'), 'https://cdn.example.com/x.png', 'data:image/png;base64,iVBORw0KGgo=']) {
      expect(safeImageSrc(ok), ok).toBe(ok);
    }
    for (const bad of ['javascript:alert(1)', 'http://x.test/a.png', '//evil.test/a.png', '/../secret.png', 'file:///c:/x.png', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:x', ' JAVASCRIPT:x']) {
      expect(safeImageSrc(bad), bad).toBeNull();
    }
  });

  it('image: alternative text; an address not allowed or not loaded → only the text', async () => {
    const h = await renderScreen({
      components: [
        { type: 'image', src: "/img/{{ 'logo' }}.png", alt: 'Logo', width: 120 },
        { type: 'image', src: 'javascript:alert(1)', alt: 'Blocked' },
      ],
    });
    const img = h.el.querySelector('lc-image img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/img/logo.png');
    expect(img.alt).toBe('Logo');
    expect(img.style.maxWidth).toBe('120px');
    const blocked = h.el.querySelectorAll('lc-image')[1];
    expect(blocked.querySelector('img')).toBeNull();
    expect(blocked.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Blocked');
    img.dispatchEvent(new Event('error'));
    await h.settle();
    expect(h.el.querySelector('lc-image .missing')?.textContent?.trim()).toBe('Logo');
  });

  it('link: to a screen with parameters, to an external address in a new tab without access to this one', async () => {
    const h = await renderScreen({
      components: [
        { type: 'link', label: 'Open order {{ 7 }}', screen: 'order-detail', params: { id: '{{ 7 }}' } },
        { type: 'link', label: 'Documentation', href: 'https://example.com/doc' },
        { type: 'link', label: 'Internal', href: '/showcase/showcase-base' },
      ],
    });
    (h.el.querySelector('lc-link button') as HTMLButtonElement).click();
    await h.settle();
    expect(h.navigations).toEqual([{ screen: 'order-detail', params: { id: 7 } }]);
    const [external, internal] = [...h.el.querySelectorAll<HTMLAnchorElement>('lc-link a')];
    expect([external.getAttribute('href'), external.target, external.rel]).toEqual(['https://example.com/doc', '_blank', 'noopener noreferrer']);
    expect([internal.getAttribute('href'), internal.target]).toEqual(['/showcase/showcase-base', '']);
  });

  it('progress: percentage limited between 0 and 100, non-numeric value → dash', async () => {
    const h = await renderScreen({
      components: [
        { type: 'progress', value: '{{ 3 }}', max: 4, label: 'Steps completed' },
        { type: 'progress', value: 250 },
        { type: 'progress', value: '{{ "abc" }}' },
      ],
    });
    const bars = [...h.el.querySelectorAll('lc-progress')];
    expect(bars[0].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('75');
    expect(plain(bars[0].querySelector('.label')?.textContent)).toBe('Steps completed');
    expect(bars[1].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    expect(plain(bars[2].textContent)).toBe('—');
  });

  it('timeline: events from the most recent, with date, description and colour; rows without a date left out', async () => {
    const h = await renderScreen({
      components: [
        { type: 'timeline', source: 'events', dateField: 'data', labelField: 'title', descriptionField: 'note', toneField: 'outcome', tones: { ko: 'danger' } },
      ],
      dataSources: { events: { type: 'rest', method: 'GET', url: '/api/events' } },
      respond: () => [
        { data: '2026-10-01', title: 'Created', note: 'by Anna' },
        { data: '2026-10-05', title: 'Rejected', outcome: 'ko' },
        { data: 'never', title: 'No date' },
      ],
    });
    // NG-ZORRO draws the content of the items elsewhere in its tree: it is read inside lc-timeline.
    await h.until(() => h.el.querySelectorAll('lc-timeline .title').length === 2, 'events');
    expect([...h.el.querySelectorAll('lc-timeline .title')].map((t) => plain(t.textContent))).toEqual(['Rejected', 'Created']);
    expect([...h.el.querySelectorAll('lc-timeline time')].map((t) => t.getAttribute('datetime'))).toEqual(['2026-10-05', '2026-10-01']);
    expect([...h.el.querySelectorAll('lc-timeline .description')].map((d) => plain(d.textContent))).toEqual(['by Anna']);
  });

  describe('kanban', () => {
    const kanban = (extra: Partial<Record<string, unknown>> = {}): NodeDefinition =>
      ({
        type: 'kanban',
        source: 'tasks',
        columnField: 'status',
        titleField: 'title',
        descriptionField: 'who',
        columns: [
          { value: 'to-do', label: 'To do' },
          { value: 'in-progress', label: 'In progress', tone: 'primary' },
          { value: 'done', label: 'Done', tone: 'success' },
        ],
        onMove: [{ call: 'move', args: { id: '{{ row.id }}', status: '{{ to }}' } }, { toast: '{{ from }} → {{ to }}' }],
        ...extra,
      }) as NodeDefinition;
    const dataSources = {
      tasks: { type: 'rest' as const, method: 'GET' as const, url: '/api/tasks' },
      move: { type: 'rest' as const, method: 'POST' as const, url: '/api/tasks/{{ id }}/move' },
    };
    const rows = [
      { id: 1, title: 'Quote', who: 'Anna', status: 'to-do' },
      { id: 2, title: 'Invoice', who: 'Luca', status: 'in-progress' },
      { id: 3, title: 'Archived', status: 'other' },
    ];
    const column = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLElement>('lc-kanban section')].find((s) => s.getAttribute('aria-label') === label)!;

    it('cards in the columns according to the field, with a count; values outside the columns left out', async () => {
      const h = await renderScreen({ components: [kanban()], dataSources, respond: (r) => (r.method === 'GET' ? rows : {}) });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 2, 'cards');
      expect([...h.el.querySelectorAll('lc-kanban h3')].map((x) => plain(x.textContent))).toEqual(['To do 1', 'In progress 1', 'Done 0']);
      expect(plain(column(h.el, 'To do').querySelector('.card')?.textContent)).toBe('Quote Anna');
    });

    it('dragging a card to another column runs onMove with row, from and to', async () => {
      const h = await renderScreen({ components: [kanban()], dataSources, respond: (r) => (r.method === 'GET' ? rows : {}) });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 2, 'cards');
      const card = column(h.el, 'To do').querySelector('.card') as HTMLElement;
      expect(card.getAttribute('draggable')).toBe('true');
      const data = { setData: () => undefined, effectAllowed: '' } as unknown as DataTransfer;
      const drag = (type: string, target: Element) => {
        const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
        Object.defineProperty(event, 'dataTransfer', { value: data });
        target.dispatchEvent(event);
      };
      drag('dragstart', card);
      drag('dragover', column(h.el, 'Done'));
      await h.settle();
      expect(column(h.el, 'Done').classList).toContain('over');
      drag('drop', column(h.el, 'Done'));
      await h.until(() => h.toasts.length === 1, 'moved');
      expect(h.requests.find((r) => r.method === 'POST')).toEqual({ method: 'POST', url: '/api/tasks/1/move', body: {} });
      expect(h.toasts).toEqual(['to-do → done']);
    });

    it('without onMove or with moveIf false (or failing) cards do not move', async () => {
      const h = await renderScreen({
        components: [kanban({ moveIf: "{{ row.who == 'Anna' }}" })],
        dataSources,
        respond: (r) => (r.method === 'GET' ? rows : {}),
      });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 2, 'cards');
      expect([...h.el.querySelectorAll('lc-kanban .card')].map((c) => c.getAttribute('draggable'))).toEqual(['true', 'false']);
      // The «Move to» menu is there only where moving is allowed, with an understandable name.
      const buttons = [...h.el.querySelectorAll('lc-kanban .card button')];
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Sposta «Quote» in…']);
    });
  });
});
