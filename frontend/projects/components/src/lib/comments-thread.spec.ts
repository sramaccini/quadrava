import type { CommentsNode } from 'schema';
import { mentionsIn, threadOf } from './comments-thread';

describe('comments thread', () => {
  const node: CommentsNode = { type: 'comments', source: 'comments' };
  const rows = [
    { author: 'Luca Bianchi', text: 'Second', date: '2026-10-02T09:00:00Z' },
    { author: 'Anna Rossi', text: 'First', date: '2026-10-01T09:00:00Z' },
    { author: 'Marta Verdi', text: 'No date', date: 'yesterday' },
    { author: 'Nobody', text: '   ' },
  ];

  it('in date order, oldest first; undated comments last, empty ones left out', () => {
    const thread = threadOf(rows, node);
    expect(thread.map((c) => c.text)).toEqual(['First', 'Second', 'No date']);
    expect(thread[0]).toMatchObject({ author: 'Anna Rossi', initials: 'AR', iso: '2026-10-01T09:00:00Z' });
    expect(thread[2]).toMatchObject({ iso: '', time: null });
    expect(threadOf(rows, { ...node, order: 'desc' }).map((c) => c.text)).toEqual(['Second', 'First', 'No date']);
  });

  it('other field names; texts from the data stay as they are', () => {
    const thread = threadOf([{ who: 'A', body: '{{ user.name }} **bold**', at: '2026-10-01' }], { ...node, authorField: 'who', textField: 'body', dateField: 'at' });
    expect(thread).toEqual([{ author: 'A', initials: 'A', text: '{{ user.name }} **bold**', iso: '2026-10-01', time: new Date('2026-10-01').getTime() }]);
  });

  it('mentions: the people chosen who are still in the text, once each', () => {
    const chosen = new Map([
      ['Anna Rossi', '1'],
      ['Luca Bianchi', '2'],
    ]);
    expect(mentionsIn('@Anna Rossi look, and @Anna Rossi again', chosen)).toEqual(['1']);
    expect(mentionsIn('nobody here', chosen)).toEqual([]);
  });
});
