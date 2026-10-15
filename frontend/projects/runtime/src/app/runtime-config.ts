import type { RegistryDefinitionsConfig } from 'services';

/**
 * Configuration read at start-up from `runtime-config.json` (public folder): where screens,
 * navigation and themes come from (examples or versions published in the registry) and which ports to use (demo or real services through the
 * BFF). The `registry` and `bff` configurations of angular.json use the files of `projects/runtime/config/`.
 */
export interface RuntimeConfig {
  definitions: { source: 'examples' } | ({ source: 'registry' } & RegistryDefinitionsConfig);
  /**
   * Ports of the runtime: `demo` (fake profiles, data and reports in the browser) or `bff` (session, permissions,
   * data and telemetry through the BFF, `services` library). When missing: demo.
   */
  services?: { source: 'demo' } | { source: 'bff'; appId: string };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = { definitions: { source: 'examples' } };

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
