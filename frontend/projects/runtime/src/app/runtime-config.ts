import type { RegistryDefinitionsConfig } from 'services';

/**
 * Configurazione letta all'avvio da `runtime-config.json` (cartella pubblica): da dove vengono schermate,
 * navigazione e temi (esempi o versioni pubblicate nel registro) e quali porte usare (demo o servizi veri attraverso il
 * BFF). Le configurazioni `registry` e `bff` di angular.json usano i file di `projects/runtime/config/`.
 */
export interface RuntimeConfig {
  definitions: { source: 'examples' } | ({ source: 'registry' } & RegistryDefinitionsConfig);
  /**
   * Porte del runtime: `demo` (profili, dati e segnalazioni finti nel browser) oppure `bff` (sessione, permessi,
   * dati e telemetria attraverso il BFF, libreria `services`). Se manca: demo.
   */
  services?: { source: 'demo' } | { source: 'bff'; appId: string };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = { definitions: { source: 'examples' } };

/** Legge la configurazione; se manca o non è valida si usano gli esempi (la demo funziona sempre). */
export async function loadRuntimeConfig(url = 'runtime-config.json'): Promise<RuntimeConfig> {
  try {
    const response = await fetch(url);
    if (!response.ok) return DEFAULT_RUNTIME_CONFIG;
    const config = (await response.json()) as RuntimeConfig;
    const services = config?.services as Record<string, unknown> | undefined;
    if (services && services['source'] === 'bff' && typeof services['appId'] !== 'string') {
      console.warn('[runtime-config] servizi bff senza appId: si usa la demo');
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
        console.warn('[runtime-config] configurazione del registro incompleta: si usano gli esempi');
        return DEFAULT_RUNTIME_CONFIG;
      }
      return config;
    }
    return { ...DEFAULT_RUNTIME_CONFIG, services: config?.services };
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}
