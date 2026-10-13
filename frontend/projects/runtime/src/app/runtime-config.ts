import type { RegistryDefinitionsConfig } from 'services';

/**
 * Configurazione letta all'avvio da `runtime-config.json` (cartella pubblica): da dove vengono schermate,
 * navigazione e temi. Nella demo dagli esempi; altrimenti dal registro, con le versioni pubblicate nell'ambiente.
 */
export type RuntimeConfig = { definitions: { source: 'examples' } } | { definitions: { source: 'registry' } & RegistryDefinitionsConfig };

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = { definitions: { source: 'examples' } };

/** Legge la configurazione; se manca o non è valida si usano gli esempi (la demo funziona sempre). */
export async function loadRuntimeConfig(url = 'runtime-config.json'): Promise<RuntimeConfig> {
  try {
    const response = await fetch(url);
    if (!response.ok) return DEFAULT_RUNTIME_CONFIG;
    const config = (await response.json()) as RuntimeConfig;
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
    return DEFAULT_RUNTIME_CONFIG;
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}
