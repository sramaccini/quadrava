import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { isFromRuntime, STUDIO_QUERY, type FromStudio } from 'core';
import { Project } from './project';
import { projectSnapshot } from './project-snapshot';
import { Workspace } from './workspace';

/** Where the address of the runtime is remembered, in this browser. */
export const RUNTIME_ADDRESS_KEY = 'lc.editor.runtimeAddress';

/**
 * The address of the runtime when none was chosen: in development the runtime runs on the port before Studio's (4200 next
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

/**
 * «Run project» (ADR-16): opens the runtime in another window of the browser with the project as it is in Studio. The
 * runtime asks for it (`lc-studio:ready`) and receives a snapshot; running again reloads the same window, which asks
 * again. Messages go only to the window opened here and to the origin of the runtime address.
 */
@Injectable({ providedIn: 'root' })
export class RunProject {
  private readonly project = inject(Project);
  private readonly workspace = inject(Workspace);
  readonly address = signal(readAddress());
  private target: Window | null = null;
  private targetOrigin: string | null = null;

  constructor() {
    const listener = (event: MessageEvent): void => {
      if (!this.target || event.source !== this.target || event.origin !== this.targetOrigin || !isFromRuntime(event.data)) return;
      void this.send(this.target, event.origin);
    };
    window.addEventListener('message', listener);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('message', listener));
  }

  /** Changes the address of the runtime; false if it is not an http(s) address. */
  setAddress(address: string): boolean {
    if (!runtimeUrl(address, location.origin)) return false;
    this.address.set(address.trim());
    try {
      localStorage.setItem(RUNTIME_ADDRESS_KEY, address.trim());
    } catch {
      // Private browsing: the address lasts for this visit.
    }
    return true;
  }

  /** Opens the runtime with the project, or reloads the window already open on it. */
  run(): RunOutcome {
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

  private async send(target: Window, origin: string): Promise<void> {
    const project = await projectSnapshot(
      this.project.resources(),
      (path) => this.project.read(path),
      this.workspace.windows().map((w) => ({ kind: w.kind, path: w.path(), doc: w.state.doc() })),
      this.workspace.catalogues(),
    );
    this.post(target, origin, { type: 'lc-studio:project', project });
  }

  private post(target: Window, origin: string, message: FromStudio): void {
    target.postMessage(message, origin);
  }
}

function readAddress(): string {
  try {
    return localStorage.getItem(RUNTIME_ADDRESS_KEY) ?? defaultRuntimeAddress(location);
  } catch {
    return defaultRuntimeAddress(location);
  }
}
