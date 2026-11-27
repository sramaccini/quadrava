import type { ScreenRuntime, Scope } from 'core';
import type { RowHighlight } from 'schema';

/** The highlight of one row or card, resolved: colours of the tone, the icon and the name of the mark. */
export interface ResolvedHighlight {
  /** Tinted background. */
  background: string;
  /** Stripe on the leading edge. */
  edge: string;
  /** Colour of the icon, readable on the background and on the surfaces. */
  mark: string;
  icon: string;
  label: string;
}

/** Colours of the theme for each tone (the same as the alerts of NG-ZORRO, dark themes included). */
const TONES: Record<NonNullable<RowHighlight['tone']>, Pick<ResolvedHighlight, 'background' | 'edge' | 'mark'>> = {
  warning: { background: 'var(--ant-warning-color-deprecated-bg, #fdf3e0)', edge: 'var(--ant-warning-color, #ad6800)', mark: 'var(--lc-text-warning, #ad6800)' },
  danger: { background: 'var(--ant-error-color-deprecated-bg, #fbe9e9)', edge: 'var(--ant-error-color, #c62828)', mark: 'var(--lc-text-error, #c62828)' },
  success: { background: 'var(--ant-success-color-deprecated-bg, #eaf2ea)', edge: 'var(--ant-success-color, #2e7d32)', mark: 'var(--lc-text-success, #2e7d32)' },
  primary: { background: 'var(--ant-primary-1, #e8eff9)', edge: 'var(--ant-primary-color, #1f5fbf)', mark: 'var(--lc-text-primary, #1f5fbf)' },
};

/**
 * The highlight of a row, or null when it has none: `when` is evaluated with the row as `row` and an error counts as
 * no (fail-closed, the error goes to the diagnostics). An empty `label` falls back to `fallbackLabel`, so the mark
 * always has a name for screen readers.
 */
export function rowHighlight(
  runtime: ScreenRuntime,
  highlight: RowHighlight | undefined,
  scope: Scope,
  fallbackLabel: string,
): ResolvedHighlight | null {
  if (!highlight) return null;
  if (!runtime.engine.evaluateCondition(highlight.when, runtime.context(scope), { whenMissing: false, fallback: false })) return null;
  return {
    ...TONES[highlight.tone ?? 'warning'],
    icon: highlight.icon ?? 'warning',
    label: runtime.text(highlight.label, scope) || fallbackLabel,
  };
}
