import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from 'schema';

/**
 * Protocollo tra l'editor e l'anteprima, che gira in un iframe isolato (ADR-08): stessa applicazione, avviata con
 * `?anteprima`. L'editor manda lo stato da disegnare; l'anteprima risponde con la propria disponibilità, le selezioni
 * fatte nel disegno e gli eventi del registro. Solo dati JSON, solo tra finestre della stessa origine.
 */

/** Parametro dell'URL con cui l'applicazione parte come anteprima. */
export const PREVIEW_QUERY = 'anteprima';

/** Tutto quello che l'anteprima deve sapere per disegnare. */
export interface PreviewState {
  /** Schermata da disegnare (null = nessuna). */
  screen: ScreenDefinition | null;
  /** Menu da disegnare a sinistra (null = nessuno). */
  navigation: NavigationDefinition | null;
  /** Tema (null = quello predefinito della demo). */
  theme: ThemeDefinition | null;
  /** Permessi del profilo simulato; null = tutti. */
  granted: string[] | null;
  /** Risposte finte per data source della schermata. */
  samples: Record<string, unknown>;
  /** Parametri della schermata (`params`). */
  params: Record<string, unknown>;
  locale: string;
  /** Traduzioni scritte nell'editor e non ancora nei cataloghi. */
  translations: Record<string, Record<string, string>>;
  /** Nodo da evidenziare. */
  selectedId: string | null;
  /** Ogni clic seleziona invece di attivare. */
  selectMode: boolean;
  /** Cambia per ricreare la schermata da capo (Ricarica). */
  version: number;
}

/** Riga del registro dell'anteprima. */
export interface PreviewEvent {
  kind: 'request' | 'navigate' | 'diagnostic';
  text: string;
}

export type ToPreview = { type: 'lc-preview:state'; state: PreviewState };

export type FromPreview =
  | { type: 'lc-preview:ready' }
  | { type: 'lc-preview:select'; id: string }
  | { type: 'lc-preview:event'; event: PreviewEvent };

export function isToPreview(data: unknown): data is ToPreview {
  return typeof data === 'object' && data !== null && (data as ToPreview).type === 'lc-preview:state' && typeof (data as ToPreview).state === 'object';
}

export function isFromPreview(data: unknown): data is FromPreview {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as FromPreview;
  if (message.type === 'lc-preview:ready') return true;
  if (message.type === 'lc-preview:select') return typeof message.id === 'string';
  if (message.type === 'lc-preview:event') return typeof message.event?.kind === 'string' && typeof message.event?.text === 'string';
  return false;
}

/** Stato vuoto, completato da chi lo usa. */
export function previewState(partial: Partial<PreviewState>): PreviewState {
  return {
    screen: null,
    navigation: null,
    theme: null,
    granted: null,
    samples: {},
    params: {},
    locale: 'it',
    translations: {},
    selectedId: null,
    selectMode: false,
    version: 0,
    ...partial,
  };
}
