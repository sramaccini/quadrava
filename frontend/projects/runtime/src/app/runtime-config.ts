import { InjectionToken } from '@angular/core';
import { validateProject } from 'schema';
import type { RegistryDefinitionsConfig } from 'services';

/**
 * Configuration read at start-up from `runtime-config.json` (public folder): where screens,
 * navigation and themes come from (examples or versions published in the registry) and which ports to use (demo or real services through the
 * BFF). The `registry` and `bff` configurations of angular.json use the files of `projects/runtime/config/`.
 */
export interface RuntimeConfig {
  /**
   * With the registry, `languages` and `defaultLanguage` say the languages of the application (from its project, which the
   * registry does not hold); with the examples they come from `examples/project.json`.
   */
  definitions: { source: 'examples' } | ({ source: 'registry'; languages?: string[]; defaultLanguage?: string } & RegistryDefinitionsConfig);
  /**
   * Ports of the runtime: `demo` (fake profiles, data and reports in the browser) or `bff` (session, permissions,
   * data and telemetry through the BFF, `services` library). When missing: demo.
   */
  services?: { source: 'demo' } | { source: 'bff'; appId: string };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = { definitions: { source: 'examples' } };

/** Settings of the application the runtime shows: its languages (the first one offered when the browser's is not among them) and, from the project, its themes. */
export interface ApplicationSettings {
  languages: string[];
  defaultLanguage: string;
  /** Themes the user can choose, the first one initial (from the project; the definition source decides when missing). */
  themes?: string[];
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = { languages: ['en', 'it'], defaultLanguage: 'en' };
export const APPLICATION_SETTINGS = new InjectionToken<ApplicationSettings>('APPLICATION_SETTINGS', { factory: () => DEFAULT_APPLICATION_SETTINGS });

/**
 * The settings of the application: with the examples, the manifest of the demo project (`examples/project.json`); with the
 * registry, the languages of the configuration. Missing or invalid: English and Italian, as before projects.
 */
export async function loadApplicationSettings(config: RuntimeConfig, url = 'examples/project.json'): Promise<ApplicationSettings> {
  if (config.definitions.source === 'registry') {
    const { languages, defaultLanguage } = config.definitions;
    if (Array.isArray(languages) && languages.length && languages.every((l) => typeof l === 'string')) {
      return { languages, defaultLanguage: typeof defaultLanguage === 'string' && languages.includes(defaultLanguage) ? defaultLanguage : languages[0] };
    }
    return DEFAULT_APPLICATION_SETTINGS;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return DEFAULT_APPLICATION_SETTINGS;
    const result = validateProject(await response.json());
    if (!result.valid) {
      console.warn('[project] examples/project.json is not valid: using the default languages');
      return DEFAULT_APPLICATION_SETTINGS;
    }
    const { languages, defaultLanguage, themes } = result.value;
    return { languages, defaultLanguage: languages.includes(defaultLanguage) ? defaultLanguage : languages[0], ...(themes?.length ? { themes } : {}) };
  } catch {
    return DEFAULT_APPLICATION_SETTINGS;
  }
}

/** Reads the configuration; if it is missing or invalid the examples are used (the demo always works). */
export async function loadRuntimeConfig(url = 'runtime-config.json'): Promise<RuntimeConfig> {
  try {
    const response = await fetch(url);
    if (!response.ok) return DEFAULT_RUNTIME_CONFIG;
    const config = (await response.json()) as RuntimeConfig;
    const services = config?.services as Record<string, unknown> | undefined;
    if (services && services['source'] === 'bff' && typeof services['appId'] !== 'string') {
      console.warn('[runtime-config] bff services without appId: using the demo');
      return DEFAULT_RUNTIME_CONFIG;
    }
    const definitions = config?.definitions as Record<string, unknown> | undefined;
    if (definitions?.['source'] === 'registry') {
      const ok =
        typeof definitions['app'] === 'string' &&
        typeof definitions['env'] === 'string' &&
        typeof definitions['navigation'] === 'string' &&
        Array.isArray(definitions['themes']) &&
        (definitions['themes'] as unknown[]).every((t) => typeof t === 'string') &&
        (definitions['themes'] as unknown[]).length > 0;
      if (!ok) {
        console.warn('[runtime-config] incomplete registry configuration: using the examples');
        return DEFAULT_RUNTIME_CONFIG;
      }
      return config;
    }
    return { ...DEFAULT_RUNTIME_CONFIG, services: config?.services };
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}
