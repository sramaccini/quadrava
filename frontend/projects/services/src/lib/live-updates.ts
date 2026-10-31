import { Injectable } from '@angular/core';
import { LiveUpdates } from 'core';
import { isSameOriginRelative } from './trace';

interface Listener {
  events: readonly string[];
  onEvent: () => void;
}

interface Stream {
  source: EventSource;
  listeners: Set<Listener>;
  /** Names of the events already listened to on the connection. */
  names: Set<string>;
  /** The connection dropped: the next opening is a reconnection. */
  dropped: boolean;
}

/** The events without a name arrive as `message`. */
const UNNAMED = 'message';

/**
 * Event streams with the browser's `EventSource`: one connection per address, however many data sources listen to it,
 * closed when the last one stops. The browser reconnects by itself; after a reconnection every listener is called, since
 * some events may have been missed. Only paths on the same origin, so the session cookie goes with them as with every
 * call; a stream refused by the BFF (for example 401) is not opened again, and the next call of the page leads to the login.
 */
@Injectable({ providedIn: 'root' })
export class EventSourceLiveUpdates extends LiveUpdates {
  private readonly streams = new Map<string, Stream>();

  /** Opens the connection (replaced in the tests). */
  protected connect(url: string): EventSource {
    return new EventSource(url);
  }

  listen(url: string, events: readonly string[], onEvent: () => void): () => void {
    if (!isSameOriginRelative(url)) return () => undefined;
    // Without EventSource (an old browser, a server render) the connection does not open: nothing to listen to.
    const stream = this.streams.get(url) ?? this.open(url);
    if (!stream) return () => undefined;
    const listener: Listener = { events, onEvent };
    stream.listeners.add(listener);
    for (const name of events.length ? events : [UNNAMED]) {
      if (stream.names.has(name)) continue;
      stream.names.add(name);
      stream.source.addEventListener(name, () => this.notify(stream, name));
    }
    return () => {
      stream.listeners.delete(listener);
      if (stream.listeners.size === 0 && this.streams.get(url) === stream) {
        stream.source.close();
        this.streams.delete(url);
      }
    };
  }

  private open(url: string): Stream | null {
    let source: EventSource;
    try {
      source = this.connect(url);
    } catch {
      return null;
    }
    const stream: Stream = { source, listeners: new Set(), names: new Set(), dropped: false };
    source.addEventListener('error', () => (stream.dropped = true));
    source.addEventListener('open', () => {
      if (!stream.dropped) return;
      stream.dropped = false;
      this.notify(stream, null);
    });
    this.streams.set(url, stream);
    return stream;
  }

  /** Calls the listeners of an event (all of them after a reconnection, `name` null); one that throws does not stop the others. */
  private notify(stream: Stream, name: string | null): void {
    for (const listener of [...stream.listeners]) {
      const wanted = name === null || (listener.events.length ? listener.events.includes(name) : name === UNNAMED);
      if (!wanted) continue;
      try {
        listener.onEvent();
      } catch {
        // A listener's error stays with it.
      }
    }
  }
}
