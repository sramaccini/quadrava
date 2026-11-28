/** A key of a shortcut, read from its text (`shift+e`): the key and the modifiers it needs. */
export interface ShortcutKey {
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'] as const;

/** Reads the text of a key: the modifiers joined with `+` before the key, in lower case (the schema checks the form). */
export function parseShortcut(text: string): ShortcutKey {
  const parts = text.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  const has = (modifier: (typeof MODIFIERS)[number]): boolean => parts.includes(modifier);
  return { key, ctrl: has('ctrl'), alt: has('alt'), shift: has('shift'), meta: has('meta') };
}

/** The parts of a key to show, in order: the modifiers, then the key (`['shift', 'e']`). */
export function shortcutParts(text: string): string[] {
  const parsed = parseShortcut(text);
  return [...MODIFIERS.filter((modifier) => parsed[modifier]), parsed.key];
}

/** A key pressed is the shortcut: the same key and exactly the same modifiers (a letter with Shift is its capital). */
export function matchesShortcut(shortcut: ShortcutKey, event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): boolean {
  return (
    event.key.toLowerCase() === shortcut.key &&
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.metaKey === shortcut.meta
  );
}

/** The key asks for the list of shortcuts: `?` (with Shift or without, as the keyboard has it). */
export function asksForShortcuts(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): boolean {
  return event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey;
}

/**
 * Where a key belongs to the user and not to the shortcuts: a field, an editor, a list of options or a menu. The
 * letters typed there are text, or move through the choices.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="menubar"]',
  );
}
