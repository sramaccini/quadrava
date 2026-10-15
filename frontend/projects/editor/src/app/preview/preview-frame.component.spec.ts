import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import { vi } from 'vitest';
import { EDITOR_MESSAGES } from '../messages';
import { PreviewFrameComponent } from './preview-frame.component';
import { previewState } from './protocol';

/** Fake resize observer: jsdom has none; the test decides the available width. */
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

describe('preview frame', () => {
  beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it('a fixed width larger than the space shrinks to fit, with the percentage; if it fits it stays at 100%', async () => {
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
    // Enough space: no reduction.
    FakeResizeObserver.last!.resize(900);
    await settle();
    expect(iframe.style.transform).toBe('');
    expect(el.querySelector('.zoom')).toBeNull();
    // Without a fixed width (desktop) it takes all the space.
    fixture.componentRef.setInput('width', null);
    FakeResizeObserver.last!.resize(300);
    await settle();
    expect(iframe.style.transform).toBe('');
  });
});
