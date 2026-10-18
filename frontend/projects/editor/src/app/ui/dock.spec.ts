import { TestBed } from '@angular/core/testing';
import { Dock } from './dock';

describe('Dock: pinned or hidden panels', () => {
  beforeEach(() => localStorage.clear());

  it('the choices saved per whole side (previous version) apply to all the panels of the side', () => {
    localStorage.setItem('lc.editor.dock', JSON.stringify({ left: false, right: true, leftWidth: 330 }));
    const dock = TestBed.inject(Dock);
    expect([dock.pinned.palette(), dock.pinned.outline(), dock.pinned.inspector()]).toEqual([false, false, true]);
    expect(dock.width('left', 280)).toBe(330);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!)).toEqual({ pins: { project: false, palette: false, outline: false, inspector: true }, leftWidth: 330 });
  });

  it('width of the column: the pinned panels, plus the strip if one is hidden; the per-panel choice wins', () => {
    localStorage.setItem('lc.editor.dock', JSON.stringify({ pins: { outline: false }, left: true }));
    const dock = TestBed.inject(Dock);
    expect(dock.columnWidth('left', ['palette', 'outline'], 280)).toBe(310);
    expect(dock.columnWidth('left', ['outline'], 280)).toBe(30);
    expect(dock.columnWidth('right', ['inspector'], 320)).toBe(320);
    dock.togglePin('palette');
    expect(dock.columnWidth('left', ['palette', 'outline'], 280)).toBe(30);
    // Just unpinned the panel is open; pinned again it closes.
    expect(dock.open()).toBe('palette');
    dock.togglePin('palette');
    expect(dock.open()).toBeNull();
    dock.resize('left', 9999);
    expect(dock.columnWidth('left', ['palette', 'outline'], 280)).toBe(640 + 30);
  });
});
