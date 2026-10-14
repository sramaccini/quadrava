import { TestBed } from '@angular/core/testing';
import { Dock } from './dock';

describe('Dock: riquadri fissati o nascosti', () => {
  beforeEach(() => localStorage.clear());

  it('le scelte salvate per lato intero (versione precedente) valgono per tutti i riquadri del lato', () => {
    localStorage.setItem('lc.editor.dock', JSON.stringify({ left: false, right: true, leftWidth: 330 }));
    const dock = TestBed.inject(Dock);
    expect([dock.pinned.palette(), dock.pinned.outline(), dock.pinned.inspector()]).toEqual([false, false, true]);
    expect(dock.width('left', 280)).toBe(330);
    TestBed.tick();
    expect(JSON.parse(localStorage.getItem('lc.editor.dock')!)).toEqual({ pins: { palette: false, outline: false, inspector: true }, leftWidth: 330 });
  });

  it('larghezza della colonna: i riquadri fissati, più la striscia se qualcuno è nascosto; la scelta per riquadro vince', () => {
    localStorage.setItem('lc.editor.dock', JSON.stringify({ pins: { outline: false }, left: true }));
    const dock = TestBed.inject(Dock);
    expect(dock.columnWidth('left', ['palette', 'outline'], 280)).toBe(310);
    expect(dock.columnWidth('left', ['outline'], 280)).toBe(30);
    expect(dock.columnWidth('right', ['inspector'], 320)).toBe(320);
    dock.togglePin('palette');
    expect(dock.columnWidth('left', ['palette', 'outline'], 280)).toBe(30);
    // Appena sganciato il riquadro è aperto; rifissato si chiude.
    expect(dock.open()).toBe('palette');
    dock.togglePin('palette');
    expect(dock.open()).toBeNull();
    dock.resize('left', 9999);
    expect(dock.columnWidth('left', ['palette', 'outline'], 280)).toBe(640 + 30);
  });
});
