import type { EditorStore } from './editor-store';

/** A key pressed, with its modifiers (Ctrl or Cmd count as `ctrl`). */
export interface KeyStroke {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

/**
 * The editing shortcuts of a screen: undo and redo, cut, copy, paste, duplicate, delete, move up and down, Esc to deselect.
 * The same in the page of the editor and in the preview (which sends them to the editor in selection mode).
 */
export function isScreenShortcut(stroke: KeyStroke): boolean {
  const key = stroke.key.toLowerCase();
  if (stroke.ctrl && !stroke.alt && ['z', 'y', 'c', 'x', 'v', 'd'].includes(key)) return true;
  if ((key === 'delete' || key === 'escape') && !stroke.ctrl && !stroke.alt) return true;
  return stroke.alt && !stroke.ctrl && (key === 'arrowup' || key === 'arrowdown');
}

/**
 * Runs a shortcut on a screen: undo and redo always, the others on the selected element (paste also without a selection, at
 * the insertion point). Returns whether the key was a shortcut and was handled.
 */
export function runScreenShortcut(store: EditorStore, stroke: KeyStroke): boolean {
  if (!isScreenShortcut(stroke)) return false;
  const key = stroke.key.toLowerCase();
  if (stroke.ctrl && key === 'z' && !stroke.shift) {
    store.undo();
    return true;
  }
  if (stroke.ctrl && (key === 'y' || (key === 'z' && stroke.shift))) {
    store.redo();
    return true;
  }
  const selection = store.selection();
  if (stroke.ctrl && key === 'v') {
    store.paste();
    return true;
  }
  if (!selection.length) return false;
  if (key === 'escape') store.select([]);
  else if (key === 'delete') {
    if (store.multi().length > 1) store.removeMany(store.multi());
    else store.remove(selection);
  } else if (stroke.ctrl && key === 'd') store.duplicate(selection);
  else if (stroke.ctrl && key === 'c') store.copy(selection);
  else if (stroke.ctrl && key === 'x') store.cut(selection);
  else if (stroke.alt && key === 'arrowup') store.move(selection, -1);
  else if (stroke.alt && key === 'arrowdown') store.move(selection, 1);
  else return false;
  return true;
}
