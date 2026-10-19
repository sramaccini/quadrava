import type { NavigationDefinition, ScreenDefinition, ThemeDefinition } from 'schema';

/**
 * Protocol between the editor and the preview, which runs in an isolated iframe (ADR-08): same application, started with
 * `?preview`. The editor sends the state to draw; the preview answers with its readiness, the selections
 * made in the drawing and the log events. JSON data only, only between windows of the same origin.
 */

/** URL parameter with which the application starts as the preview. */
export const PREVIEW_QUERY = 'preview';

/** Type of the data dragged from the palette: a component type (also `input.<type>`). Outline and preview recognise it. */
export const PALETTE_DRAG_TYPE = 'application/x-lc-node-type';

/** Type of the data dragged inside the preview: the id of a component already there (move). */
export const NODE_DRAG_TYPE = 'application/x-lc-preview-node';

/** Property the resize handle changes: columns in a grid, share in a box. */
export type ResizeProperty = 'span' | 'grow';

/** Where a dropped component falls relative to the one under the pointer. */
export type DropZone = 'before' | 'after' | 'inside';

/** Everything the preview must know to draw. */
export interface PreviewState {
  /** Screen to draw (null = none). */
  screen: ScreenDefinition | null;
  /** Menu to draw on the left (null = none). */
  navigation: NavigationDefinition | null;
  /** Theme (null = the default one of the demo). */
  theme: ThemeDefinition | null;
  /** Permissions of the simulated profile; null = all. */
  granted: string[] | null;
  /** Fake responses per data source of the screen. */
  samples: Record<string, unknown>;
  /** Parameters of the screen (`params`). */
  params: Record<string, unknown>;
  locale: string;
  /** Default language: the one of the fallback texts, used when a translation is missing. */
  defaultLocale: string;
  /** Translations written in the editor and not yet in the catalogues. */
  translations: Record<string, Record<string, string>>;
  /** Node to highlight. */
  selectedId: string | null;
  /** Every click selects instead of activating. */
  selectMode: boolean;
  /** Changes to recreate the screen from scratch (Reload). */
  version: number;
  /** Reads from the real services (same origin) instead of the sample data; writes stay blocked. */
  liveData: boolean;
}

/** Row of the preview log. */
export interface PreviewEvent {
  kind: 'request' | 'navigate' | 'diagnostic';
  text: string;
}

export type ToPreview = { type: 'lc-preview:state'; state: PreviewState };

export type FromPreview =
  | { type: 'lc-preview:ready' }
  | { type: 'lc-preview:select'; id: string }
  | { type: 'lc-preview:event'; event: PreviewEvent }
  /** A palette component dropped on the drawing: before, after or inside node `targetId` (null = at the end of the screen). */
  | { type: 'lc-preview:drop'; kind: string; targetId: string | null; zone: DropZone }
  /** A component already there dragged on the drawing (selection mode): move it relative to `targetId`. */
  | { type: 'lc-preview:move'; id: string; targetId: string | null; zone: DropZone }
  /** Handle of the selected component: new value of `span` (grid) or `grow` (box). */
  | { type: 'lc-preview:resize'; id: string; property: ResizeProperty; value: number }
  /** An editing shortcut pressed in selection mode (undo, copy, paste, delete…): the editor runs it. */
  | { type: 'lc-preview:key'; key: string; ctrl: boolean; shift: boolean; alt: boolean }
  /** Right click on component `id` in selection mode, at `x`, `y` of the preview's viewport: the editor opens its menu. */
  | { type: 'lc-preview:context'; id: string; x: number; y: number };

export function isToPreview(data: unknown): data is ToPreview {
  return typeof data === 'object' && data !== null && (data as ToPreview).type === 'lc-preview:state' && typeof (data as ToPreview).state === 'object';
}

export function isFromPreview(data: unknown): data is FromPreview {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as FromPreview;
  if (message.type === 'lc-preview:ready') return true;
  if (message.type === 'lc-preview:select') return typeof message.id === 'string';
  if (message.type === 'lc-preview:event') return typeof message.event?.kind === 'string' && typeof message.event?.text === 'string';
  if (message.type === 'lc-preview:move') {
    return typeof message.id === 'string' && (message.targetId === null || typeof message.targetId === 'string') && ['before', 'after', 'inside'].includes(message.zone);
  }
  if (message.type === 'lc-preview:resize') {
    return typeof message.id === 'string' && ['span', 'grow'].includes(message.property) && Number.isInteger(message.value) && message.value >= 1 && message.value <= 12;
  }
  if (message.type === 'lc-preview:key') {
    return typeof message.key === 'string' && message.key.length <= 20 && [message.ctrl, message.shift, message.alt].every((flag) => typeof flag === 'boolean');
  }
  if (message.type === 'lc-preview:context') {
    return typeof message.id === 'string' && Number.isFinite(message.x) && Number.isFinite(message.y);
  }
  if (message.type === 'lc-preview:drop') {
    return (
      typeof message.kind === 'string' &&
      /^[A-Za-z]+(\.[a-z]+)?$/.test(message.kind) &&
      (message.targetId === null || typeof message.targetId === 'string') &&
      ['before', 'after', 'inside'].includes(message.zone)
    );
  }
  return false;
}

/** Empty state, completed by whoever uses it. */
export function previewState(partial: Partial<PreviewState>): PreviewState {
  return {
    screen: null,
    navigation: null,
    theme: null,
    granted: null,
    samples: {},
    params: {},
    locale: 'en',
    defaultLocale: 'en',
    translations: {},
    selectedId: null,
    selectMode: false,
    version: 0,
    liveData: false,
    ...partial,
  };
}
