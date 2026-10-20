import { isFromStudio, STUDIO_QUERY, type FromRuntime, type ProjectSnapshot } from 'core';
import { DEFAULT_APPLICATION_SETTINGS, type ApplicationSettings, type RuntimeConfig } from './runtime-config';

/**
 * The runtime opened by Quadrava Studio with «Run project» (ADR-16): it asks the window that opened it for the project and
 * starts on that snapshot. Only from the origins of Studio listed in `runtime-config.json` (`studio.origins`).
 */

/** The window that opened this one, as far as the link needs it. */
export interface StudioWindow {
  postMessage(message: FromRuntime, targetOrigin: string): void;
}

/** The origin of the Studio that opened the runtime (`?studio=`), if the configuration allows it; otherwise null. */
export function studioOrigin(config: RuntimeConfig, search: string = location.search): string | null {
  const origin = new URLSearchParams(search).get(STUDIO_QUERY);
  if (!origin) return null;
  if (!(config.studio?.origins ?? []).includes(origin)) {
    console.warn('[studio] this runtime does not accept projects from that origin (studio.origins in runtime-config.json)');
    return null;
  }
  return origin;
}

/**
 * Asks Studio for the project and waits for it: only from `opener` and from `origin`, in the expected shape. Rejects if
 * nothing arrives within `timeoutMs` (Studio closed, or the runtime reloaded by hand without it).
 */
export function receiveProject(origin: string, opener: StudioWindow | null = window.opener as StudioWindow | null, timeoutMs = 15_000): Promise<ProjectSnapshot> {
  return new Promise((resolve, reject) => {
    if (!opener) {
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

/** After the start: «Run project» again in Studio reloads this window, which asks again for the project. */
export function followStudio(origin: string, opener: unknown = window.opener, reload: () => void = () => location.reload()): () => void {
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
  const { languages, defaultLanguage } = result.value;
  return { languages, defaultLanguage: languages.includes(defaultLanguage) ? defaultLanguage : languages[0], ...(themes.length ? { themes } : {}) };
}
