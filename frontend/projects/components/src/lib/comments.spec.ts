import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('comments', () => {
  const people = [
    { id: 1, name: 'Anna Rossi' },
    { id: 2, name: 'Luca Bianchi' },
  ];
  const thread = [
    { author: 'Luca Bianchi', text: 'Done, see **the report**.', date: '2026-10-02T09:00:00Z' },
    { author: 'Anna Rossi', text: 'Can you check the figures?', date: '2026-10-01T09:00:00Z' },
  ];
  const comments = (extra: Record<string, unknown> = {}): NodeDefinition =>
    ({
      type: 'comments',
      source: 'comments',
      onPost: [{ call: 'addComment' }, { refresh: 'comments' }],
      mentions: { source: 'people', labelField: 'name' },
      ...extra,
    }) as NodeDefinition;
  const dataSources = {
    comments: { type: 'rest' as const, method: 'GET' as const, url: '/api/comments' },
    people: { type: 'rest' as const, method: 'GET' as const, url: '/api/people', params: { q: '{{ search }}' } },
    addComment: { type: 'rest' as const, method: 'POST' as const, url: '/api/comments', body: { text: '{{ text }}', mentions: '{{ mentions }}' } },
  };
  const respond = (r: DataRequest) => {
    if (r.url === '/api/people') {
      const q = String(r.query?.['q'] ?? '').toLowerCase();
      return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : [];
    }
    return r.method === 'GET' ? thread : {};
  };
  const box = (h: ScreenHarness) => h.el.querySelector('lc-comments textarea') as HTMLTextAreaElement;
  const write = (h: ScreenHarness, text: string): void => {
    box(h).value = text;
    box(h).setSelectionRange(text.length, text.length);
    box(h).dispatchEvent(new Event('input'));
  };
  const key = (h: ScreenHarness, name: string, init: KeyboardEventInit = {}): void => {
    box(h).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
  };
  const publish = (h: ScreenHarness) => [...h.el.querySelectorAll('lc-comments button')].find((b) => plain(b.textContent) === 'Publish') as HTMLButtonElement;

  it('the thread in date order: author, date and Markdown text, never HTML', async () => {
    const h = await renderScreen({ components: [comments({ onPost: undefined })], dataSources, respond });
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 2, 'comments');
    const articles = [...h.el.querySelectorAll('lc-comments article')];
    expect(articles.map((a) => a.getAttribute('aria-label'))).toEqual(['Anna Rossi', 'Luca Bianchi']);
    expect(articles[1].querySelector('time')?.getAttribute('datetime')).toBe('2026-10-02T09:00:00Z');
    expect(articles[1].querySelector('strong')?.textContent).toBe('the report');
    // Without onPost the thread is read-only.
    expect(box(h)).toBeNull();
    expect(h.reports).toEqual([]);
  });

  it('writing with a mention and publishing: the steps see text and mentions, the box empties', async () => {
    const h = await renderScreen({ components: [comments()], dataSources, respond });
    await h.until(() => !!box(h), 'box');
    expect(h.el.querySelector(`label[for="${box(h).id}"]`)?.textContent?.trim()).toBe('Write a comment');
    expect(publish(h).disabled).toBe(true);
    write(h, 'Thanks @ann');
    await h.until(() => h.el.querySelectorAll('lc-comments [role="option"]').length === 1, 'people');
    // The data source of the people is asked with the letters after @, as a lookup (besides its automatic load).
    expect(h.requests.filter((r) => r.url === '/api/people' && r.query?.['q']).map((r) => r.query?.['q'])).toEqual(['ann']);
    key(h, 'ArrowDown');
    key(h, 'Enter');
    await h.settle();
    expect(box(h).value).toBe('Thanks @Anna Rossi ');
    write(h, 'Thanks @Anna Rossi for **this**');
    key(h, 'Enter', { ctrlKey: true });
    await h.until(() => h.requests.some((r) => r.method === 'POST'), 'publishing');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ text: 'Thanks @Anna Rossi for **this**', mentions: ['1'] });
    await h.until(() => box(h).value === '', 'emptied');
    expect(plain(h.el.querySelector('lc-comments > [aria-live]')?.textContent)).toBe('Comment published');
    // The thread is reloaded by the refresh step.
    expect(h.requests.filter((r) => r.url === '/api/comments' && r.method === 'GET').length).toBe(2);
  });

  it('postIf decides who writes, fail-closed', async () => {
    const h = await renderScreen({
      components: [comments({ postIf: "{{ can('tasks.comments.create') }}" }), comments({ postIf: '{{ nope( }}' })],
      dataSources,
      respond,
    });
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 4, 'comments');
    expect(h.el.querySelectorAll('lc-comments textarea').length).toBe(0);
    h.permissions.set(new Set(['tasks.comments.create']));
    await h.settle();
    // Granted: the first one shows the box; the broken condition still grants nothing.
    expect(h.el.querySelectorAll('lc-comments textarea').length).toBe(1);
  });

  it('a failed publication keeps the text', async () => {
    const h = await renderScreen({
      components: [comments()],
      dataSources,
      respond: (r) => {
        if (r.method === 'POST') throw new Error('500');
        return respond(r);
      },
    });
    await h.until(() => !!box(h), 'box');
    write(h, 'Will this work?');
    await h.settle();
    publish(h).click();
    await h.until(() => h.toasts.length > 0, 'error message');
    await h.settle();
    expect(box(h).value).toBe('Will this work?');
    expect(publish(h).disabled).toBe(false);
  });
});
