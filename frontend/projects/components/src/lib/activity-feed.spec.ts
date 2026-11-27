import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import type { CommentsNode, NodeDefinition } from 'schema';
import { durationText, filterThread, threadOf } from './comments-thread';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('activity feed (comments with kindField)', () => {
  const rows = [
    { kind: 'comment', author: 'Anna Rossi', text: 'Can we reproduce it?', date: '2026-10-01T09:00:00Z' },
    { kind: 'change', author: 'Luca Bianchi', field: 'status', from: 'todo', to: 'doing', date: '2026-10-02T09:00:00Z' },
    { kind: 'change', author: 'Luca Bianchi', field: 'priority', from: null, to: 'high', date: '2026-10-03T09:00:00Z' },
    { kind: 'change', author: 'Marta Verdi', field: 'dueDate', from: '2026-11-01', to: null, date: '2026-10-04T09:00:00Z' },
    { kind: 'worklog', author: 'Anna Rossi', minutes: 150, text: 'Reproduced on Safari', date: '2026-10-05T09:00:00Z' },
  ];
  const feed: CommentsNode = {
    type: 'comments',
    source: 'activity',
    kindField: 'kind',
    changes: { fieldKey: 'issue.fields', valueKey: 'values' },
    workLog: {},
    filters: true,
    orderToggle: true,
    order: 'desc',
  };

  describe('pure functions', () => {
    it('the kind of each row decides how it is read; without kindField every row is a comment', () => {
      const items = threadOf(rows, feed);
      expect(items.map((i) => i.kind)).toEqual(['worklog', 'change', 'change', 'change', 'comment']);
      expect(items[1].change).toEqual({ field: 'dueDate', from: '2026-11-01', to: null });
      expect(items[0].minutes).toBe(150);
      expect(filterThread(items, { kinds: ['change'] })).toHaveLength(3);
      expect(filterThread(items, {})).toHaveLength(5);
      // The chips of the screen filter by the value of kindField as it came.
      expect(filterThread(items, { values: ['comment', 'worklog'] }).map((i) => i.rawKind)).toEqual(['worklog', 'comment']);
      // A change has no text: without kindField it would be an empty comment, and is left out.
      expect(threadOf(rows, { type: 'comments', source: 'activity' }).map((i) => i.text)).toEqual(['Can we reproduce it?', 'Reproduced on Safari']);
      // A kind the feed does not declare is a comment.
      expect(threadOf(rows, { ...feed, workLog: undefined }).find((i) => i.text === 'Reproduced on Safari')?.kind).toBe('comment');
    });

    it('minutes as hours and minutes in the language of the user', () => {
      expect(durationText(150, 'en-GB')).toBe('2 hrs 30 mins');
      expect(durationText(45, 'it-IT')).toBe('45 min');
      expect(durationText(120, 'it-IT')).toBe('2 h');
      expect(durationText(0, 'en-GB')).toBe('0 mins');
    });
  });

  const dataSources = { activity: { type: 'rest' as const, method: 'GET' as const, url: '/api/activity' } };
  const lines = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('lc-comments article header')].map((e) => plain(e.querySelector('.author')?.textContent) + ' ' + plain(e.querySelector('.line')?.textContent ?? ''));
  const button = (h: ScreenHarness, text: string): HTMLButtonElement => [...h.el.querySelectorAll<HTMLButtonElement>('lc-comments button')].find((b) => plain(b.textContent) === text)!;

  it('draws changes and work logs as lines, translated; chips filter in the page; the order turns', async () => {
    const h = await renderScreen({
      components: [{ ...feed, orderBind: 'state.activityOrder' } as NodeDefinition],
      dataSources,
      respond: () => rows,
    });
    TestBed.inject(I18n).addMessages('en', { 'issue.fields.status': 'Status', 'issue.fields.priority': 'Priority', 'values.status.todo': 'To do', 'values.status.doing': 'In progress' });
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 5, 'feed');
    expect(lines(h)).toEqual([
      'Anna Rossi logged 2 hrs 30 mins',
      'Marta Verdi cleared dueDate',
      'Luca Bianchi set Priority to high',
      'Luca Bianchi changed Status from To do to In progress',
      'Anna Rossi ',
    ]);
    expect(plain(h.el.querySelector('lc-comments ol')?.getAttribute('aria-label'))).toBe('Activity');
    // The note of a work log is drawn under its line; a change has no body.
    expect(plain(h.el.querySelectorAll('lc-comments article')[0].querySelector('lc-markdown')?.textContent)).toBe('Reproduced on Safari');
    expect(h.el.querySelectorAll('lc-comments article')[1].querySelector('lc-markdown')).toBeNull();

    const chips = [...h.el.querySelectorAll<HTMLButtonElement>('lc-comments .chips button')];
    expect(chips.map((b) => plain(b.textContent))).toEqual(['All', 'Comments', 'History', 'Work log']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    chips[2].click();
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 3, 'history only');
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    chips[3].click();
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 1, 'work log only');
    chips[0].click();
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 5, 'all again');

    expect(h.fixture.componentInstance.runtime()!.getState('state.activityOrder')).toBe('desc');
    button(h, 'Newest first').click();
    await h.until(() => lines(h)[0] === 'Anna Rossi ', 'oldest first');
    expect(h.fixture.componentInstance.runtime()!.getState('state.activityOrder')).toBe('asc');
    expect(button(h, 'Oldest first')).toBeTruthy();
    expect(h.reports).toEqual([]);
  });

  it('the chips of the screen: their labels and the values of kindField they show', async () => {
    const h = await renderScreen({
      components: [
        {
          ...feed,
          filters: [{ label: "{{ 'Every' + 'thing' }}" }, { label: 'Talk and work', kinds: ['comment', 'worklog'] }, { label: 'Status', kinds: ['change'] }],
        } as NodeDefinition,
      ],
      dataSources,
      respond: () => rows,
    });
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 5, 'feed');
    const chips = [...h.el.querySelectorAll<HTMLButtonElement>('lc-comments .chips button')];
    expect(chips.map((b) => plain(b.textContent))).toEqual(['Everything', 'Talk and work', 'Status']);
    chips[1].click();
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 2, 'comments and work');
    chips[2].click();
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 3, 'changes');
    expect(h.reports).toEqual([]);
  });

  it('a chip with no rows says so', async () => {
    const h = await renderScreen({ components: [{ ...feed, workLog: { kind: 'none' } } as NodeDefinition], dataSources, respond: () => rows.filter((r) => r.kind !== 'worklog') });
    await h.until(() => h.el.querySelectorAll('lc-comments article').length === 4, 'feed');
    button(h, 'Work log').click();
    await h.until(() => plain(h.el.querySelector('lc-comments .empty')?.textContent) === 'Nothing to show.', 'empty chip');
  });

  it('without filters and orderToggle there is no bar above the feed', async () => {
    const plainFeed = await renderScreen({ components: [{ type: 'comments', source: 'activity', kindField: 'kind', changes: {} } as NodeDefinition], dataSources, respond: () => rows });
    await plainFeed.until(() => plainFeed.el.querySelectorAll('lc-comments article').length === 5, 'feed');
    expect(plainFeed.el.querySelector('lc-comments .feed-bar')).toBeNull();
  });
});
