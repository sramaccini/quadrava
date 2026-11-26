import type { Scope } from 'core';
import type { ButtonFaceProps } from 'schema';

/** What a button shows, resolved from its node: shared by `button` and `menuButton`. */
export interface ButtonFace {
  /** The text: shown, or with display icon the name read by screen readers and the tooltip. */
  text: string;
  /** The count, already formatted; null when absent, empty or not a number. */
  count: string | null;
  /** The accessible name: the text, with the count after it («Watchers: 2»). */
  name: string;
  /** Only the icon (display icon with an icon). */
  iconOnly: boolean;
  /** Pressed state; null when the button is not a toggle (no `pressed`). An expression in error is not pressed. */
  pressed: boolean | null;
}

/** The parts of the runtime the face needs: texts and conditions (fail-closed). */
export interface FaceRuntime {
  text(template: string | undefined, scope: Scope): string;
  isEnabled(node: { enabledIf?: string }, scope: Scope): boolean;
}

export function buttonFace(
  node: ButtonFaceProps & { label: string; icon?: string },
  runtime: FaceRuntime,
  scope: Scope,
  formatNumber: (value: number) => string = String,
): ButtonFace {
  const text = runtime.text(node.label, scope);
  const raw = node.count === undefined ? '' : runtime.text(node.count, scope).trim();
  const value = raw === '' ? NaN : Number(raw);
  const count = Number.isFinite(value) ? formatNumber(value) : null;
  return {
    text,
    count,
    name: count === null ? text : `${text}: ${count}`,
    iconOnly: node.display === 'icon' && !!node.icon,
    pressed: node.pressed === undefined ? null : runtime.isEnabled({ enabledIf: node.pressed }, scope),
  };
}
