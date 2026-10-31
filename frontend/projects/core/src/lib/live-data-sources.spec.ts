import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ScreenDefinition } from 'schema';
import { LiveUpdates } from './ports';
import { ScreenRuntime } from './screen-runtime';
import { Fakes } from './testing';

/** Event streams driven by the test: `emit` calls the listeners of an address. */
class FakeLive extends LiveUpdates {
  readonly listening: { url: string; events: readonly string[]; onEvent: () => void }[] = [];
  listen(url: string, events: readonly string[], onEvent: () => void): () => void {
    const entry = { url, events, onEvent };
    this.listening.push(entry);
    return () => this.listening.splice(this.listening.indexOf(entry), 1);
  }
  emit(url: string): void {
    for (const l of this.listening.filter((x) => x.url === url)) l.onEvent();
  }
}

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'board',
  requires: 'tasks.tasks.read',
  dataSources: {
    tasks: { type: 'rest', method: 'GET', url: '/api/tasks', live: { url: '/api/events', events: ['tasks.changed'] } },
    people: { type: 'rest', method: 'GET', url: '/api/people' },
  },
  components: [],
};

describe('live data sources', () => {
  let fakes: Fakes;
  let live: FakeLive;
  let injector: Injector;
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const reads = (url: string) => fakes.requests.filter((r) => r.url === url).length;

  beforeEach(() => {
    fakes = new Fakes();
    fakes.permissions.add('tasks.tasks.read');
    live = new FakeLive();
    injector = TestBed.inject(Injector);
  });

  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.tick();
  }

  it('an event reads the data source again, a burst of events only once; the others are not touched', async () => {
    const rt = new ScreenRuntime(screen, { ...fakes.deps, live }, injector);
    await settle();
    expect(live.listening.map((l) => [l.url, l.events])).toEqual([['/api/events', ['tasks.changed']]]);
    expect(reads('/api/tasks')).toBe(1);
    live.emit('/api/events');
    live.emit('/api/events');
    live.emit('/api/events');
    await pause(260);
    await settle();
    expect(reads('/api/tasks')).toBe(2);
    expect(reads('/api/people')).toBe(1);
    // Components that query the data source themselves follow it as after a refresh step.
    expect(rt.refreshCount()['tasks']).toBe(1);
    rt.destroy();
    expect(live.listening).toEqual([]);
  });

  it('leaving the screen cancels a read already scheduled', async () => {
    const rt = new ScreenRuntime(screen, { ...fakes.deps, live }, injector);
    await settle();
    live.emit('/api/events');
    rt.destroy();
    await pause(260);
    expect(reads('/api/tasks')).toBe(1);
  });

  it('nothing is listened to without the permission of the screen, or without the port', async () => {
    fakes.permissions.clear();
    new ScreenRuntime(screen, { ...fakes.deps, live }, injector);
    await settle();
    expect(live.listening).toEqual([]);
    fakes.permissions.add('tasks.tasks.read');
    // Without LiveUpdates the data source is read as usual.
    new ScreenRuntime(screen, fakes.deps, injector);
    await settle();
    expect(reads('/api/tasks')).toBe(1);
  });

  it('a stream that is not on the same origin is not opened and is reported', async () => {
    const bad: ScreenDefinition = {
      ...screen,
      dataSources: { tasks: { type: 'rest', method: 'GET', url: '/api/tasks', live: { url: '//evil.test/events' } } },
    };
    new ScreenRuntime(bad, { ...fakes.deps, live }, injector);
    await settle();
    expect(live.listening).toEqual([]);
    expect(fakes.reports.map((r) => r.error)).toEqual(['event stream not on the same origin: //evil.test/events']);
  });
});
