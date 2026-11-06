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

  describe('changing and deleting a comment', () => {
    const owned = [
      { id: 7, author: 'Anna Rossi', text: 'Mine, *first*', date: '2026-10-01T09:00:00Z', _perm: { update: true, delete: true } },
      { id: 8, author: 'Luca Bianchi', text: 'Not mine', date: '2026-10-02T09:00:00Z', editedAt: '2026-10-02T10:00:00Z', _perm: { update: false, delete: false } },
    ];
    const sources = {
      ...dataSources,
      updateComment: { type: 'rest' as const, method: 'PUT' as const, url: '/api/comments/{{ id }}', body: { text: '{{ text }}', mentions: '{{ mentions }}' } },
      deleteComment: { type: 'rest' as const, method: 'DELETE' as const, url: '/api/comments/{{ id }}' },
    };
    const editable = (extra: Record<string, unknown> = {}): NodeDefinition =>
      comments({
        onEdit: [{ call: 'updateComment', args: { id: '{{ row.id }}' } }, { refresh: 'comments' }],
        editIf: '{{ row._perm.update }}',
        onDelete: [{ call: 'deleteComment', args: { id: '{{ row.id }}' } }, { refresh: 'comments' }],
        deleteIf: '{{ row._perm.delete }}',
        editedField: 'editedAt',
        ...extra,
      });
    const answer = (r: DataRequest) => (r.url === '/api/comments' && r.method === 'GET' ? owned : respond(r));
    const article = (h: ScreenHarness, i: number) => h.el.querySelectorAll('lc-comments article')[i] as HTMLElement;
    const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => plain(b.textContent) === text) as HTMLButtonElement | undefined;
    const editBox = (h: ScreenHarness) => article(h, 0).querySelector('textarea') as HTMLTextAreaElement | null;
    const loaded = (h: ScreenHarness) => h.until(() => h.el.querySelectorAll('lc-comments article').length === 2, 'comments');

    it('the buttons follow editIf and deleteIf with the comment in row; edited is shown next to the date', async () => {
      const h = await renderScreen({ components: [editable()], dataSources: sources, respond: answer });
      await loaded(h);
      expect(button(article(h, 0), 'Edit')).toBeTruthy();
      expect(button(article(h, 0), 'Delete')).toBeTruthy();
      expect(button(article(h, 1), 'Edit')).toBeUndefined();
      expect(button(article(h, 1), 'Delete')).toBeUndefined();
      expect(plain(article(h, 0).querySelector('header')?.textContent)).not.toContain('edited');
      expect(plain(article(h, 1).querySelector('header')?.textContent)).toContain('edited');
      expect(h.reports).toEqual([]);
    });

    it('a broken condition shows no button (fail-closed)', async () => {
      const h = await renderScreen({ components: [editable({ editIf: '{{ nope( }}', deleteIf: '{{ nope( }}' })], dataSources: sources, respond: answer });
      await loaded(h);
      expect(h.el.querySelectorAll('lc-comments article button').length).toBe(0);
    });

    it('Edit turns the comment into the box with its text; Save runs onEdit with row, text and mentions', async () => {
      const h = await renderScreen({ components: [editable()], dataSources: sources, respond: answer });
      await loaded(h);
      button(article(h, 0), 'Edit')!.click();
      await h.until(() => !!editBox(h), 'edit box');
      expect(editBox(h)!.value).toBe('Mine, *first*');
      expect(editBox(h)!.getAttribute('aria-label')).toBe('Edit the comment');
      await h.until(() => document.activeElement === editBox(h), 'focus in the box');
      editBox(h)!.value = 'Mine, *changed*';
      editBox(h)!.dispatchEvent(new Event('input'));
      await h.settle();
      button(article(h, 0), 'Save')!.click();
      await h.until(() => h.requests.some((r) => r.method === 'PUT'), 'saving');
      const put = h.requests.find((r) => r.method === 'PUT')!;
      expect(put.url).toBe('/api/comments/7');
      expect(put.body).toEqual({ text: 'Mine, *changed*', mentions: [] });
      await h.until(() => !editBox(h), 'box closed');
      expect(plain(h.el.querySelector('lc-comments > [aria-live]')?.textContent)).toBe('Comment changed');
      expect(h.requests.filter((r) => r.url === '/api/comments' && r.method === 'GET').length).toBe(2);
      expect(h.reports).toEqual([]);
    });

    it('Escape and Cancel restore the comment without running anything; the focus goes back to Edit', async () => {
      const h = await renderScreen({ components: [editable()], dataSources: sources, respond: answer });
      await loaded(h);
      button(article(h, 0), 'Edit')!.click();
      await h.until(() => !!editBox(h), 'edit box');
      editBox(h)!.value = 'Thrown away';
      editBox(h)!.dispatchEvent(new Event('input'));
      editBox(h)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.until(() => !editBox(h), 'closed by Escape');
      expect(plain(article(h, 0).querySelector('lc-markdown')?.textContent)).toBe('Mine, first');
      await h.until(() => document.activeElement === button(article(h, 0), 'Edit'), 'focus on Edit');
      button(article(h, 0), 'Edit')!.click();
      await h.until(() => !!editBox(h), 'edit box again');
      expect(editBox(h)!.value).toBe('Mine, *first*');
      button(article(h, 0), 'Cancel')!.click();
      await h.until(() => !editBox(h), 'closed by Cancel');
      expect(h.requests.some((r) => r.method === 'PUT')).toBe(false);
    });

    it('a failed change keeps the box with the text', async () => {
      const h = await renderScreen({
        components: [editable()],
        dataSources: sources,
        respond: (r) => {
          if (r.method === 'PUT') throw new Error('500');
          return answer(r);
        },
      });
      await loaded(h);
      button(article(h, 0), 'Edit')!.click();
      await h.until(() => !!editBox(h), 'edit box');
      editBox(h)!.value = 'Will this work?';
      editBox(h)!.dispatchEvent(new Event('input'));
      editBox(h)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
      await h.until(() => h.toasts.length > 0, 'error message');
      await h.settle();
      expect(editBox(h)?.value).toBe('Will this work?');
    });

    it('Delete runs onDelete with the comment in row', async () => {
      const h = await renderScreen({ components: [editable()], dataSources: sources, respond: answer });
      await loaded(h);
      button(article(h, 0), 'Delete')!.click();
      await h.until(() => h.requests.some((r) => r.method === 'DELETE'), 'deleting');
      expect(h.requests.find((r) => r.method === 'DELETE')?.url).toBe('/api/comments/7');
      await h.until(() => plain(h.el.querySelector('lc-comments > [aria-live]')?.textContent) === 'Comment deleted', 'announced');
      expect(h.reports).toEqual([]);
    });
  });
});
