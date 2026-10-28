import { Injectable, signal } from '@angular/core';
import { desktopApi } from './desktop';

/**
 * Optional settings of a published Studio, in its public folder, written at build time (tools/deploy-config.mjs, from
 * environment variables):
 *
 * ```json
 * { "runtimeAddress": "https://runtime.example/", "registry": false }
 * ```
 *
 * - `runtimeAddress`: the runtime «Run project» opens, for everyone who opens this Studio;
 * - `registry`: `false` switches off saving to and opening from the registry (menus, review, publishing of the texts).
 */
export const STUDIO_CONFIG_URL = 'studio-config.json';

/** The settings as read: only what is valid, the rest as if missing. */
export interface StudioConfig {
  runtimeAddress?: string;
  registry?: boolean;
}

/** Settings fixed in advance, for tests: nothing is read from the network. */
export function fixedStudioSettings(config: StudioConfig = {}): Pick<StudioSettings, 'runtimeAddress' | 'registry' | 'loaded'> {
  return { runtimeAddress: signal(config.runtimeAddress ?? null), registry: signal(config.registry ?? true), loaded: Promise.resolve() };
}

/** The valid settings of a parsed `studio-config.json` (anything else, such as an HTML page, gives none). */
export function readStudioConfig(value: unknown): StudioConfig {
  const config: StudioConfig = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return config;
  const { runtimeAddress, registry } = value as Record<string, unknown>;
  if (typeof runtimeAddress === 'string' && isHttpAddress(runtimeAddress)) config.runtimeAddress = runtimeAddress.trim();
  if (typeof registry === 'boolean') config.registry = registry;
  return config;
}

function isHttpAddress(address: string): boolean {
  try {
    const url = new URL(address.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The settings of this installation of Studio, read once at start. Without the file (or without a setting) the defaults
 * hold: the registry is on in the browser. In the desktop app it is always off, whatever the file says: there is no BFF
 * next to it and its session cookie cannot reach the app (ADR-17).
 */
@Injectable({ providedIn: 'root' })
export class StudioSettings {
  private readonly desktop = !!desktopApi();
  /** The runtime address of the settings, if any. */
  readonly runtimeAddress = signal<string | null>(null);
  /** Saving to and opening from the registry are possible here. */
  readonly registry = signal(!this.desktop);
  /** Resolved when the file has been read (or found missing). */
  readonly loaded: Promise<void> = this.load();

  private async load(): Promise<void> {
    try {
      const response = await fetch(STUDIO_CONFIG_URL, { cache: 'no-cache' });
      if (!response.ok) return;
      const config = readStudioConfig(await response.json());
      if (config.runtimeAddress) this.runtimeAddress.set(config.runtimeAddress);
      if (config.registry !== undefined && !this.desktop) this.registry.set(config.registry);
    } catch {
      // No settings (or not JSON, for example the page of a single-page host): the defaults hold.
    }
  }
}
