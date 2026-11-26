import { rowsOf, type DataSourceState, type Scope } from 'core';
import type { MenuActionItem, MenuItemDefinition, MenuSourceItems, Step, Tone } from 'schema';

const TONES: readonly string[] = ['neutral', 'primary', 'success', 'danger'];

/** A tone written in the JSON or given by an expression: any other value is neutral (fail-closed, no colour). */
export function toneOf(value: string | undefined): Tone {
  return value !== undefined && TONES.includes(value) ? (value as Tone) : 'neutral';
}

/** What the menu shows, in order: items to choose, dividers and, for a data source still loading, the indicator. */
export type MenuEntry =
  | { kind: 'item'; key: string; label: string; icon?: string; badge?: string; tone: Tone; disabled: boolean; steps: Step[]; scope: Scope }
  | { kind: 'divider'; key: string }
  | { kind: 'loading'; key: string };

/** What the entries need from the screen: texts, conditions, data sources and translations. */
export interface MenuEnvironment {
  text(template: string | undefined, scope: Scope): string;
  isVisible(item: { visibleIf?: string }, scope: Scope): boolean;
  isEnabled(item: { enabledIf?: string }, scope: Scope): boolean;
  source(name: string): DataSourceState;
  translate(key: string, fallback: string): string;
}

const isDivider = (item: MenuItemDefinition): item is { divider: true } => 'divider' in item;
const isSource = (item: MenuItemDefinition): item is MenuSourceItems => 'source' in item;

/**
 * The entries of the menu of a `menuButton`. The items of a data source carry their row as `item` in their scope; a
 * data source that is loading gives one loading entry (no items yet), one with no rows gives nothing. Dividers at the
 * start or the end, or next to another divider, are left out, so an empty data source leaves no stray line.
 */
export function menuEntries(items: readonly MenuItemDefinition[], env: MenuEnvironment, scope: Scope): MenuEntry[] {
  const entries: MenuEntry[] = [];
  items.forEach((item, i) => {
    if (isDivider(item)) {
      entries.push({ kind: 'divider', key: `divider-${i}` });
    } else if (isSource(item)) {
      const state = env.source(item.source);
      if (state.status === 'loading' && rowsOf(state.data).length === 0) {
        entries.push({ kind: 'loading', key: `loading-${i}` });
        return;
      }
      rowsOf(state.data).forEach((row, r) => {
        const rowScope: Scope = { ...scope, item: row };
        const key = row[item.keyField ?? 'id'];
        const badge = item.badgeField ? row[item.badgeField] : undefined;
        const toneValue = row[item.toneField ?? item.badgeField ?? ''];
        const shown = badge === undefined || badge === null || badge === '' ? undefined : String(badge);
        entries.push({
          kind: 'item',
          key: `${i}-${key === undefined || key === null ? r : String(key)}`,
          label: textOf(row[item.labelField]),
          badge: shown !== undefined && item.valueKey ? env.translate(`${item.valueKey}.${shown}`, shown) : shown,
          tone: toneValue === undefined || toneValue === null ? 'neutral' : item.tones?.[String(toneValue)] ?? 'neutral',
          disabled: !env.isEnabled(item, rowScope),
          steps: item.onClick,
          scope: rowScope,
        });
      });
    } else {
      const action = item as MenuActionItem;
      if (!env.isVisible(action, scope)) return;
      entries.push({
        kind: 'item',
        key: action.id ?? `item-${i}`,
        label: env.text(action.label, scope),
        icon: action.icon,
        tone: toneOf(action.tone),
        disabled: !env.isEnabled(action, scope),
        steps: action.onClick,
        scope,
      });
    }
  });
  const tidy: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'divider' && (tidy.length === 0 || tidy[tidy.length - 1].kind === 'divider')) continue;
    tidy.push(entry);
  }
  if (tidy[tidy.length - 1]?.kind === 'divider') tidy.pop();
  return tidy;
}

function textOf(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}
