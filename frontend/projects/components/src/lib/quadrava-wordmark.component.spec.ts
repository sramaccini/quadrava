import { TestBed } from '@angular/core/testing';
import { QuadravaWordmarkComponent } from './quadrava-wordmark.component';

describe('Quadrava logotype', () => {
  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(QuadravaWordmarkComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('icon and text in Sora with the coloured Q; a single name for screen readers', async () => {
    const { el } = await render({ icon: 'brand/quadrava-icon-small.svg' });
    const mark = el.querySelector('[role="img"]') as HTMLElement;
    expect(mark.getAttribute('aria-label')).toBe('Quadrava');
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(el.querySelector('.word')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.word .q')?.textContent).toBe('Q');
    expect(getComputedStyle(el.querySelector('.word')!).fontFamily).toContain('Sora');
    expect(el.querySelector('.product')).toBeNull();
  });

  it('with the product («Studio»), on dark, and compact (icon only)', async () => {
    const { fixture, el } = await render({ icon: 'i.svg', product: 'Studio', tone: 'dark' });
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Quadrava Studio');
    expect(el.querySelector('.word')?.textContent?.replace(/ /g, ' ')).toBe('Quadrava Studio');
    expect(el.querySelector('.qv')?.classList.contains('dark')).toBe(true);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(el.querySelector('.word')).toBeNull();
    expect(el.querySelector('img')).not.toBeNull();
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Quadrava Studio');
  });

  it('without an icon only the text stays', async () => {
    const { el } = await render({});
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.word')?.textContent).toBe('Quadrava');
  });
});
