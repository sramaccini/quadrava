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
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Move “Quote” to…']);
    });

    const dragEvent = (type: string, target: Element, clientY = 0) => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: { setData: () => undefined, effectAllowed: '' } });
      Object.defineProperty(event, 'clientY', { value: clientY });
      target.dispatchEvent(event);
    };
    const places = '{{ from }}→{{ to }} after {{ beforeId == null ? "-" : string(beforeId) }} before {{ afterId == null ? "-" : string(afterId) }}';
    const ranked = [
      { id: 1, title: 'Quote', status: 'to-do', who: 'Anna Rossi' },
      { id: 2, title: 'Contract', status: 'to-do', who: 'Luca' },
      { id: 3, title: 'Reminder', status: 'to-do', who: 'Anna Rossi' },
      { id: 4, title: 'Invoice', status: 'in-progress', who: 'Luca' },
    ];

    it('with reorder a card is dropped between the cards of its column; onMove sees the keys of the neighbours', async () => {
      const h = await renderScreen({ components: [kanban({ reorder: true, onMove: [{ toast: places }] })], dataSources, respond: () => ranked });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      const cards = () => [...column(h.el, 'To do').querySelectorAll<HTMLElement>('.card')];
      // «Reminder» over the lower half of «Quote»: between Quote and Contract.
      dragEvent('dragstart', cards()[2]);
      dragEvent('dragover', cards()[0], 10);
      await h.settle();
      expect(cards()[1].classList).toContain('drop-before');
      dragEvent('drop', cards()[0]);
      await h.until(() => h.toasts.length === 1, 'moved');
      // To another column, over the upper half of its only card: before it.
      dragEvent('dragstart', cards()[0]);
      dragEvent('dragover', column(h.el, 'In progress').querySelector('.card')!, 0);
      dragEvent('drop', column(h.el, 'In progress'));
      await h.until(() => h.toasts.length === 2, 'moved again');
      expect(h.toasts).toEqual(['to-do→to-do after 1 before 2', 'to-do→in-progress after - before 4']);
    });

    it('with reorder the «Move» menu also moves up and down; the first cannot go up', async () => {
      const h = await renderScreen({ components: [kanban({ reorder: true, onMove: [{ toast: places }] })], dataSources, respond: () => ranked });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      (column(h.el, 'To do').querySelector('.card button') as HTMLButtonElement).click();
      await h.until(() => document.querySelectorAll('.ant-dropdown-menu-item').length > 0, 'menu');
      const items = [...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')];
      expect(items.map((i) => plain(i.textContent))).toEqual(['Move up', 'Move down', 'In progress', 'Done']);
      expect(items[0].classList).toContain('ant-dropdown-menu-item-disabled');
      items[0].click();
      items[1].click();
      await h.until(() => h.toasts.length === 1, 'moved down');
      expect(h.toasts).toEqual(['to-do→to-do after 2 before 3']);
      // Screen readers hear where the card is (here the data does not change: it is still first).
      await h.until(() => plain(h.el.querySelector('lc-kanban [aria-live]')?.textContent) === '“Quote” is in To do, position 1 of 3', 'announcement');
      document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
    });

    it('without reorder a card dropped on its own column does not move', async () => {
      const h = await renderScreen({ components: [kanban({ onMove: [{ toast: places }] })], dataSources, respond: () => ranked });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      const card = column(h.el, 'To do').querySelector('.card') as HTMLElement;
      dragEvent('dragstart', card);
      dragEvent('dragover', column(h.el, 'To do'));
      dragEvent('drop', column(h.el, 'To do'));
      await h.settle();
      expect(h.toasts).toEqual([]);
    });

    it('swimlanes: one per value, collapsible; a card moves only within its lane', async () => {
      const h = await renderScreen({ components: [kanban({ laneField: 'who', onMove: [{ toast: places }] })], dataSources, respond: () => ranked });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      const lanes = () => [...h.el.querySelectorAll<HTMLButtonElement>('lc-kanban .lane button')];
      expect(lanes().map((b) => [plain(b.textContent), b.getAttribute('aria-expanded')])).toEqual([
        ['Anna Rossi 2', 'true'],
        ['Luca 2', 'true'],
      ]);
      expect([...h.el.querySelectorAll('lc-kanban section')].map((s) => s.getAttribute('aria-label')).slice(0, 3)).toEqual(['Anna Rossi — To do', 'Anna Rossi — In progress', 'Anna Rossi — Done']);
      // Column headers once, above the lanes.
      expect([...h.el.querySelectorAll('lc-kanban .head h3')].map((x) => plain(x.textContent))).toEqual(['To do 3', 'In progress 1', 'Done 0']);
      const card = column(h.el, 'Anna Rossi — To do').querySelector('.card') as HTMLElement;
      dragEvent('dragstart', card);
      dragEvent('dragover', column(h.el, 'Luca — Done'));
      await h.settle();
      expect(column(h.el, 'Luca — Done').classList).not.toContain('over');
      dragEvent('dragover', column(h.el, 'Anna Rossi — Done'));
      dragEvent('drop', column(h.el, 'Anna Rossi — Done'));
      await h.until(() => h.toasts.length === 1, 'moved');
      expect(h.toasts).toEqual(['to-do→done after - before -']);
      lanes()[0].click();
      await h.settle();
      expect(lanes()[0].getAttribute('aria-expanded')).toBe('false');
      expect(column(h.el, 'Anna Rossi — To do')).toBeUndefined();
      expect(h.el.querySelectorAll('lc-kanban .card')).toHaveLength(2);
    });

    it('a column over its limit shows the count against the limit and a warning in words', async () => {
      const columns = [
        { value: 'to-do', label: 'To do', limit: 2 },
        { value: 'in-progress', label: 'In progress', limit: 1 },
      ];
      const h = await renderScreen({ components: [kanban({ columns })], dataSources, respond: () => ranked });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      expect([...h.el.querySelectorAll('lc-kanban h3')].map((x) => plain(x.textContent))).toEqual(['To do 3/2 over the limit', 'In progress 1/1']);
      expect(column(h.el, 'To do').classList).toContain('over-limit');
      expect(column(h.el, 'In progress').classList).not.toContain('over-limit');
    });

    it('rich cards: labels coloured by value, the initials of the person, values at the bottom', async () => {
      const rows = [{ id: 1, title: 'Quote', status: 'to-do', who: 'Anna Rossi', priority: 'high', kind: '', points: 3 }];
      const h = await renderScreen({
        components: [
          kanban({
            descriptionField: undefined,
            badges: [{ field: 'priority', tones: { high: 'danger' } }, { field: 'kind' }],
            avatarField: 'who',
            footerFields: [
              { field: 'points', label: 'Points' },
              { field: 'due', label: 'Due' },
            ],
          }),
        ],
        dataSources,
        respond: () => rows,
      });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 1, 'cards');
      const card = h.el.querySelector('lc-kanban .card') as HTMLElement;
      expect([...card.querySelectorAll('nz-tag')].map((t) => plain(t.textContent))).toEqual(['high']);
      const avatar = card.querySelector('.avatar') as HTMLElement;
      expect([plain(avatar.textContent), avatar.getAttribute('role'), avatar.getAttribute('aria-label')]).toEqual(['AR', 'img', 'Anna Rossi']);
      expect(plain(card.querySelector('.footer')?.textContent)).toBe('Points: 3');
    });

    it('columns from a data source: order, headers as text, colours and limits from the rows', async () => {
      const statuses = [
        { id: 'in-progress', name: 'Doing {{ 1 + 1 }}', colour: 'primary', wip: 1 },
        { id: 'to-do', name: 'Backlog' },
      ];
      const h = await renderScreen({
        components: [kanban({ columns: undefined, columnsFrom: { source: 'statuses', valueField: 'id', labelField: 'name', toneField: 'colour', limitField: 'wip' } })],
        dataSources: { ...dataSources, statuses: { type: 'rest' as const, method: 'GET' as const, url: '/api/statuses' } },
        respond: (r) => (r.url === '/api/statuses' ? statuses : ranked),
      });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      expect([...h.el.querySelectorAll('lc-kanban h3')].map((x) => plain(x.textContent))).toEqual(['Doing {{ 1 + 1 }} 1/1', 'Backlog 3']);
      expect(h.reports).toEqual([]);
    });

    it('columns from an expression: the list that it returns', async () => {
      const h = await renderScreen({
        components: [kanban({ columns: "{{ [{'value': 'to-do', 'label': 'Open'}, {'value': 'in-progress', 'label': 'Busy', 'limit': '5'}] }}" })],
        dataSources,
        respond: () => ranked,
      });
      await h.until(() => h.el.querySelectorAll('lc-kanban .card').length === 4, 'cards');
      expect([...h.el.querySelectorAll('lc-kanban h3')].map((x) => plain(x.textContent))).toEqual(['Open 3', 'Busy 1/5']);
    });
  });
});
