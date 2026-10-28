import { isFromStudio, STUDIO_CHANNEL, STUDIO_QUERY, type FromRuntime, type ProjectSnapshot } from 'core';
import { DEFAULT_APPLICATION_SETTINGS, type ApplicationSettings, type RuntimeConfig } from './runtime-config';

/**
 * The runtime opened by Quadrava Studio with «Run project» (ADR-16): it asks the window that opened it for the project and
 * starts on that snapshot. Only from the origins of Studio listed in `runtime-config.json` (`studio.origins`).
 */

/** The window that opened this one, as far as the link needs it. */
export interface StudioWindow {
  postMessage(message: FromRuntime, targetOrigin: string): void;
  readonly closed?: boolean;
}

/**
 * Where the tab remembers the origin of its Studio: the routes of the runtime drop `?studio=` (the home page goes to
 * the first screen), and a reload must still ask Studio for the project. Only for this tab (sessionStorage).
 */
export const STUDIO_SESSION_KEY = 'lc.studio.origin';

function remembered(): string | null {
  try {
    return sessionStorage.getItem(STUDIO_SESSION_KEY);
  } catch {
    return null;
  }
}

/** Remembers the origin of Studio for the reloads of this tab. */
export function rememberStudio(origin: string): void {
  try {
    sessionStorage.setItem(STUDIO_SESSION_KEY, origin);
  } catch {
    // Private browsing: a reload by hand starts without Studio.
  }
}

/**
 * The origin of the Studio that opened the runtime (`?studio=`, or remembered by this tab), if the configuration allows it;
 * otherwise null.
 */
export function studioOrigin(config: RuntimeConfig, search: string = location.search, stored: string | null = remembered()): string | null {
  const origin = new URLSearchParams(search).get(STUDIO_QUERY) ?? stored;
  if (!origin) return null;
  if (!(config.studio?.origins ?? []).includes(origin)) {
    console.warn('[studio] this runtime does not accept projects from that origin (studio.origins in runtime-config.json)');
    return null;
  }
  return origin;
}

/** The parts of a `BroadcastChannel` the link uses. */
export interface StudioChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

/**
 * The channel to Studio when it is on the same origin and did not open this window (the desktop app): null in the browser,
 * where Studio is the opener.
 */
export function sameOriginChannel(origin: string, opener: unknown = window.opener, here: string = location.origin): StudioChannel | null {
  return !opener && origin === here && typeof BroadcastChannel === 'function' ? new BroadcastChannel(STUDIO_CHANNEL) : null;
}

/**
 * Asks Studio for the project and waits for it: only from `opener` and from `origin` (or, in the desktop app, on the
 * channel of the same origin), in the expected shape. Rejects if nothing arrives within `timeoutMs` (Studio closed, or the
 * runtime reloaded by hand without it).
 */
export function receiveProject(
  origin: string,
  opener: StudioWindow | null = window.opener as StudioWindow | null,
  timeoutMs = 15_000,
  channel: StudioChannel | null = sameOriginChannel(origin, opener),
): Promise<ProjectSnapshot> {
  if (channel) return receiveOnChannel(channel, timeoutMs);
  return new Promise((resolve, reject) => {
    if (!opener || opener.closed) {
      reject(new Error('no Studio window to ask for the project'));
      return;
    }
    const done = (): void => {
      window.removeEventListener('message', listener);
      clearTimeout(timer);
    };
    const listener = (event: MessageEvent): void => {
      if (event.origin !== origin || event.source !== opener || !isFromStudio(event.data) || event.data.type !== 'lc-studio:project') return;
      done();
      resolve(event.data.project);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('Studio did not send the project'));
    }, timeoutMs);
    window.addEventListener('message', listener);
    opener.postMessage({ type: 'lc-studio:ready' }, origin);
  });
}

/** The project on the channel of the same origin (desktop app). */
function receiveOnChannel(channel: StudioChannel, timeoutMs: number): Promise<ProjectSnapshot> {
  return new Promise((resolve, reject) => {
    const done = (): void => {
      channel.removeEventListener('message', listener);
      channel.close();
      clearTimeout(timer);
    };
    const listener = (event: MessageEvent): void => {
      if (!isFromStudio(event.data) || event.data.type !== 'lc-studio:project') return;
      done();
      resolve(event.data.project);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('Studio did not send the project'));
    }, timeoutMs);
    channel.addEventListener('message', listener);
    channel.postMessage({ type: 'lc-studio:ready' } satisfies FromRuntime);
  });
}

/**
 * After the start: «Run project» again in Studio reloads this window, which asks again for the project. In the desktop app
 * (the channel of the same origin) the window goes back to its start page: a deep route would not be found there on reload.
 */
export function followStudio(
  origin: string,
  opener: unknown = window.opener,
  reload: () => void = () => location.reload(),
  channel: StudioChannel | null = sameOriginChannel(origin, opener),
  restart: () => void = () => location.replace(`${document.baseURI}?${STUDIO_QUERY}=${encodeURIComponent(origin)}`),
): () => void {
  if (channel) {
    const onChannel = (event: MessageEvent): void => {
      if (isFromStudio(event.data) && event.data.type === 'lc-studio:reload') restart();
    };
    channel.addEventListener('message', onChannel);
    return () => {
      channel.removeEventListener('message', onChannel);
      channel.close();
    };
  }
  const listener = (event: MessageEvent): void => {
    if (event.origin === origin && event.source === opener && isFromStudio(event.data) && event.data.type === 'lc-studio:reload') reload();
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** Languages and themes of the application from the manifest of the snapshot; without a valid one, the defaults. */
export async function studioSettings(project: ProjectSnapshot): Promise<ApplicationSettings> {
  const { validateProject } = await import('schema/validation');
  const result = validateProject(project.manifest);
  const themes = result.valid && result.value.themes?.length ? result.value.themes : Object.keys(project.themes);
  if (!result.valid) return { ...DEFAULT_APPLICATION_SETTINGS, ...(themes.length ? { themes } : {}) };
  const { languages, defaultLanguage, settings } = result.value;
  return {
    languages,
    defaultLanguage: languages.includes(defaultLanguage) ? defaultLanguage : languages[0],
    ...(themes.length ? { themes } : {}),
    ...(settings && Object.keys(settings).length ? { settings } : {}),
  };
}
