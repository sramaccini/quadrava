import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { isFromRuntime, STUDIO_CHANNEL, STUDIO_QUERY, type FromStudio } from 'core';
import { desktopApi } from './desktop';
import { StudioSettings } from './studio-settings';
import { Project } from './project';
import { projectSnapshot } from './project-snapshot';
import { Workspace } from './workspace';

/** Where the address of the runtime is remembered, in this browser. */
export const RUNTIME_ADDRESS_KEY = 'lc.editor.runtimeAddress';


/**
 * The address of the runtime when none was chosen and the settings give none: in development the runtime runs on the port before Studio's (4200 next
 * to 4201, 4300 next to 4301); elsewhere, the root of the same origin.
 */
export function defaultRuntimeAddress(here: Pick<Location, 'protocol' | 'hostname' | 'port' | 'origin'>): string {
  const port = Number(here.port);
  return Number.isInteger(port) && port > 1 ? `${here.protocol}//${here.hostname}:${port - 1}/` : `${here.origin}/`;
}

/** The address of the runtime with `?studio=<origin of Studio>`, or null if it is not an http(s) address. */
export function runtimeUrl(address: string, studioOrigin: string): string | null {
  try {
    const url = new URL(address.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.searchParams.set(STUDIO_QUERY, studioOrigin);
    return url.toString();
  } catch {
    return null;
  }
}

/** Outcome of «Run project». */
export type RunOutcome = 'opened' | 'reloaded' | 'blocked' | 'invalid';

/** In the desktop app: the runtime bundled with Studio (ADR-17), opened in this window of the app. */
export const DESKTOP_RUNTIME_PATH = '/runtime/';
export const DESKTOP_RUN_LABEL = 'run';

/**
 * «Run project» (ADR-16): opens the runtime in another window of the browser with the project as it is in Studio. The
 * runtime asks for it (`lc-studio:ready`) and receives a snapshot; running again reloads the same window, which asks
 * again. Messages go only to the window opened here and to the origin of the runtime address.
 */
@Injectable({ providedIn: 'root' })
export class RunProject {
  private readonly project = inject(Project);
  private readonly workspace = inject(Workspace);
  /** The address chosen by the user in this browser. */
  private readonly chosen = signal(readChosenAddress());
  private readonly configured = inject(StudioSettings).runtimeAddress;
  /**
   * The Tauri APIs in the desktop app (ADR-17): there the runtime bundled with Studio opens in a second window of the app,
   * on the same origin, and the project travels on a `BroadcastChannel` (no `window.opener` between two windows of the app).
   */
  private readonly desktop = desktopApi();
  /** In the desktop app the runtime bundled with it; otherwise the address chosen, then the one of the settings, then the guess. */
  readonly address = computed(() => (this.desktop ? DESKTOP_RUNTIME_PATH : (this.chosen() ?? this.configured() ?? defaultRuntimeAddress(location))));
  /** «Run project» can be used: always in the browser; in the desktop app when it can open windows. */
  readonly available = !this.desktop || !!this.desktop.webviewWindow;
  /** The runtime address can be chosen (in the desktop app it is the one bundled). */
  readonly addressChoice = !this.desktop;
  private target: Window | null = null;
  private targetOrigin: string | null = null;
  private channel: BroadcastChannel | null = null;

  constructor() {
    const listener = (event: MessageEvent): void => {
      if (!this.target || event.source !== this.target || event.origin !== this.targetOrigin || !isFromRuntime(event.data)) return;
      void this.send((message) => this.post(this.target!, event.origin, message));
    };
    window.addEventListener('message', listener);
    // In the desktop app the runtime asks on the channel of the same origin, which only the windows of the app share.
    if (this.desktop && typeof BroadcastChannel === 'function') {
      const channel = (this.channel = new BroadcastChannel(STUDIO_CHANNEL));
      channel.onmessage = (event: MessageEvent) => {
        if (isFromRuntime(event.data)) void this.send((message) => channel.postMessage(message));
      };
    }
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('message', listener);
      this.channel?.close();
    });
  }

  /** Changes the address of the runtime; false if it is not an http(s) address. */
  setAddress(address: string): boolean {
    if (!runtimeUrl(address, location.origin)) return false;
    this.chosen.set(address.trim());
    try {
      localStorage.setItem(RUNTIME_ADDRESS_KEY, address.trim());
    } catch {
      // Private browsing: the address lasts for this visit.
    }
    return true;
  }

  /** Opens the runtime with the project, or reloads the window already open on it. */
  run(): RunOutcome | Promise<RunOutcome> {
    if (this.desktop) return this.runInApp();
    const url = runtimeUrl(this.address(), location.origin);
    if (!url) return 'invalid';
    const origin = new URL(url).origin;
    if (this.target && !this.target.closed && this.targetOrigin === origin) {
      this.post(this.target, origin, { type: 'lc-studio:reload' });
      this.target.focus();
      return 'reloaded';
    }
    const opened = window.open(url, 'quadrava-run');
    if (!opened) return 'blocked';
    this.target = opened;
    this.targetOrigin = origin;
    return 'opened';
  }

  /** In the desktop app: the window of the bundled runtime, opened or brought to the front and reloaded. */
  private async runInApp(): Promise<RunOutcome> {
    const windows = this.desktop?.webviewWindow?.WebviewWindow;
    if (!windows || !this.channel) return 'blocked';
    const open = await windows.getByLabel(DESKTOP_RUN_LABEL);
    if (open) {
      this.channel.postMessage({ type: 'lc-studio:reload' } satisfies FromStudio);
      await open.setFocus();
      return 'reloaded';
    }
    const url = `${DESKTOP_RUNTIME_PATH}?${STUDIO_QUERY}=${encodeURIComponent(location.origin)}`;
    new windows(DESKTOP_RUN_LABEL, { url, title: this.project.manifest()?.name ?? 'Quadrava', width: 1280, height: 860 });
    return 'opened';
  }

  private async send(post: (message: FromStudio) => void): Promise<void> {
    const project = await projectSnapshot(
      this.project.resources(),
      (path) => this.project.read(path),
      this.workspace.windows().map((w) => ({ kind: w.kind, path: w.path(), doc: w.state.doc() })),
      this.workspace.catalogues(),
    );
    post({ type: 'lc-studio:project', project });
  }

  private post(target: Window, origin: string, message: FromStudio): void {
    target.postMessage(message, origin);
  }
}

function readChosenAddress(): string | null {
  try {
    return localStorage.getItem(RUNTIME_ADDRESS_KEY);
  } catch {
    return null;
  }
}
