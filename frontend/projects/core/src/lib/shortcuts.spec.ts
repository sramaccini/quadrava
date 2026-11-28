import { asksForShortcuts, isTypingTarget, matchesShortcut, parseShortcut, shortcutParts } from './shortcuts';

describe('keyboard shortcuts', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });

  it('a key matches with exactly its modifiers', () => {
    expect(matchesShortcut(parseShortcut('m'), key('m'))).toBe(true);
    expect(matchesShortcut(parseShortcut('m'), key('M', { shiftKey: true }))).toBe(false);
    expect(matchesShortcut(parseShortcut('shift+e'), key('E', { shiftKey: true }))).toBe(true);
    expect(matchesShortcut(parseShortcut('ctrl+k'), key('k', { ctrlKey: true }))).toBe(true);
    expect(matchesShortcut(parseShortcut('ctrl+k'), key('k', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(matchesShortcut(parseShortcut('f2'), key('F2'))).toBe(true);
  });

  it('the parts to show put the modifiers in a fixed order', () => {
    expect(shortcutParts('shift+ctrl+k')).toEqual(['ctrl', 'shift', 'k']);
    expect(shortcutParts('i')).toEqual(['i']);
  });

  it('? asks for the list, with or without Shift', () => {
    expect(asksForShortcuts(key('?', { shiftKey: true }))).toBe(true);
    expect(asksForShortcuts(key('?'))).toBe(true);
    expect(asksForShortcuts(key('?', { ctrlKey: true }))).toBe(false);
  });

  it('keys typed in a field, an editor or a menu are not shortcuts', () => {
    const page = document.createElement('div');
    page.innerHTML = '<input><textarea></textarea><div contenteditable="true"><p></p></div><ul role="menu"><li></li></ul><button></button>';
    document.body.append(page);
    expect(isTypingTarget(page.querySelector('input'))).toBe(true);
    expect(isTypingTarget(page.querySelector('textarea'))).toBe(true);
    expect(isTypingTarget(page.querySelector('p'))).toBe(true);
    expect(isTypingTarget(page.querySelector('li'))).toBe(true);
    expect(isTypingTarget(page.querySelector('button'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    page.remove();
  });
});
