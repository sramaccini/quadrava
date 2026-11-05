import { notificationsOf, unreadCount } from './notifications';

describe('notificationsOf', () => {
  it('keeps the messages with id and title, newest first, and drops anything else', () => {
    const items = notificationsOf([
      { id: 'a', title: 'Old', date: '2026-11-01T09:00:00Z', read: true },
      { id: 'b', title: 'New', text: 'Approved', date: '2026-11-05T09:00:00Z', screen: 'invoice-list', params: { status: 'sent', page: 2, bad: { x: 1 } }, extra: 'x' },
      { id: 'c', title: 'Undated' },
      { title: 'no id' },
      { id: 'a', title: 'repeated id' },
      { id: 'd', title: '' },
      'text',
      null,
    ]);
    expect(items).toEqual([
      { id: 'b', title: 'New', text: 'Approved', date: '2026-11-05T09:00:00Z', read: false, screen: 'invoice-list', params: { status: 'sent', page: 2 } },
      { id: 'a', title: 'Old', date: '2026-11-01T09:00:00Z', read: true },
      { id: 'c', title: 'Undated', read: false },
    ]);
  });

  it('accepts only an array, a real date and a screen identifier', () => {
    expect(notificationsOf({ items: [] })).toEqual([]);
    expect(notificationsOf([{ id: 'a', title: 'T', date: 'yesterday', screen: '../admin' }])).toEqual([{ id: 'a', title: 'T', read: false }]);
  });

  it('counts the unread ones', () => {
    expect(unreadCount(notificationsOf([{ id: 'a', title: 'A' }, { id: 'b', title: 'B', read: true }, { id: 'c', title: 'C', read: 'yes' }]))).toBe(2);
  });
});
