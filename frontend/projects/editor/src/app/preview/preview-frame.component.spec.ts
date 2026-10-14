import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import { PreviewFrameComponent } from './preview-frame.component';
import { previewState } from './protocol';

/** Osservatore di dimensioni finto: jsdom non ne ha; il test decide la larghezza disponibile. */
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this;
  }
  observe(): void {}
  disconnect(): void {}
  resize(width: number): void {
    this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

describe('cornice dell’anteprima', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('una larghezza fissa più grande dello spazio si riduce per starci, con la percentuale; se ci sta resta al 100%', async () => {
    TestBed.inject(I18n).addMessages('it', EDITOR_MESSAGES['it']);
    const fixture = TestBed.createComponent(PreviewFrameComponent);
    fixture.componentRef.setInput('state', previewState({}));
    fixture.componentRef.setInput('width', 768);
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    FakeResizeObserver.last!.resize(691);
    await settle();
    const iframe = el.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('768px');
    expect(iframe.style.transform).toBe('scale(0.8997395833333334)');
    expect(iframe.style.height).toMatch(/^calc\(111\.14\d*%\)$/);
    expect(el.querySelector('.zoom')?.textContent).toBe('Ridotta al 90% per starci');
    // Spazio sufficiente: nessuna riduzione.
    FakeResizeObserver.last!.resize(900);
    await settle();
    expect(iframe.style.transform).toBe('');
    expect(el.querySelector('.zoom')).toBeNull();
    // Senza larghezza fissa (desktop) occupa tutto lo spazio.
    fixture.componentRef.setInput('width', null);
    FakeResizeObserver.last!.resize(300);
    await settle();
    expect(iframe.style.transform).toBe('');
  });
});
