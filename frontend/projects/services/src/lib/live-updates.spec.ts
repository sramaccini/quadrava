import { EventSourceLiveUpdates } from './live-updates';

/** A connection that the test drives: it dispatches the events the stream would send. */
class FakeSource extends EventTarget {
  closed = false;
  constructor(readonly url: string) {
    super();
  }
  close(): void {
    this.closed = true;
  }
  send(name: string): void {
    this.dispatchEvent(new Event(name));
  }
}

class TestLiveUpdates extends EventSourceLiveUpdates {
  readonly opened: FakeSource[] = [];
  protected override connect(url: string): EventSource {
    const source = new FakeSource(url);
    this.opened.push(source);
    return source as unknown as EventSource;
  }
}

describe('EventSourceLiveUpdates', () => {
  it('one connection per address; each listener hears its own events, unnamed ones when it names none', () => {
    const live = new TestLiveUpdates();
    const heard: string[] = [];
    const stopTasks = live.listen('/api/events', ['tasks.changed'], () => heard.push('tasks'));
    live.listen('/api/events', ['comments.added'], () => heard.push('comments'));
    live.listen('/api/other', [], () => heard.push('other'));
    expect(live.opened.map((s) => s.url)).toEqual(['/api/events', '/api/other']);
    live.opened[0].send('tasks.changed');
    live.opened[0].send('comments.added');
    live.opened[0].send('message');
    live.opened[1].send('message');
    expect(heard).toEqual(['tasks', 'comments', 'other']);
    // The connection closes with the last listener.
    stopTasks();
    expect(live.opened[0].closed).toBe(false);
  });

  it('after a reconnection every listener is called; the last one to stop closes the connection', () => {
    const live = new TestLiveUpdates();
    let calls = 0;
    const stop = live.listen('/api/events', ['tasks.changed'], () => calls++);
    const source = live.opened[0];
    // The first opening is not a reconnection.
    source.send('open');
    expect(calls).toBe(0);
    source.send('error');
    source.send('open');
    expect(calls).toBe(1);
    stop();
    expect(source.closed).toBe(true);
    // A new listener opens a new connection.
    live.listen('/api/events', ['tasks.changed'], () => calls++);
    expect(live.opened).toHaveLength(2);
  });

  it('only paths on the same origin; a listener that throws does not stop the others', () => {
    const live = new TestLiveUpdates();
    for (const bad of ['https://evil.test/events', '//evil.test/events', 'events']) live.listen(bad, [], () => undefined)();
    expect(live.opened).toEqual([]);
    let heard = 0;
    live.listen('/api/events', [], () => {
      throw new Error('broken');
    });
    live.listen('/api/events', [], () => heard++);
    live.opened[0].send('message');
    expect(heard).toBe(1);
  });

  it('without EventSource nothing opens and nothing throws', () => {
    const live = new EventSourceLiveUpdates();
    const original = globalThis.EventSource;
    // jsdom has no EventSource: the real connection cannot open.
    (globalThis as { EventSource?: unknown }).EventSource = undefined;
    try {
      expect(() => live.listen('/api/events', [], () => undefined)()).not.toThrow();
    } finally {
      (globalThis as { EventSource?: unknown }).EventSource = original;
    }
  });
});
