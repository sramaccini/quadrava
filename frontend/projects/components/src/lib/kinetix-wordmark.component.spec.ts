import { TestBed } from '@angular/core/testing';
import { KinetixWordmarkComponent } from './kinetix-wordmark.component';

describe('logotipo KinetiX', () => {
  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(KinetixWordmarkComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('icona e testo in Sora con la X colorata; un solo nome per i lettori di schermo', async () => {
    const { el } = await render({ icon: 'brand/kinetix-icon-small.svg' });
    const mark = el.querySelector('[role="img"]') as HTMLElement;
    expect(mark.getAttribute('aria-label')).toBe('KinetiX');
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(el.querySelector('.word')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.word .x')?.textContent).toBe('X');
    expect(getComputedStyle(el.querySelector('.word')!).fontFamily).toContain('Sora');
    expect(el.querySelector('.product')).toBeNull();
  });

  it('con il prodotto («Studio»), su scuro, e compatto (solo icona)', async () => {
    const { fixture, el } = await render({ icon: 'i.svg', product: 'Studio', tone: 'dark' });
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('KinetiX Studio');
    expect(el.querySelector('.word')?.textContent?.replace(/ /g, ' ')).toBe('KinetiX Studio');
    expect(el.querySelector('.kx')?.classList.contains('dark')).toBe(true);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(el.querySelector('.word')).toBeNull();
    expect(el.querySelector('img')).not.toBeNull();
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('KinetiX Studio');
  });

  it('senza icona resta il solo testo', async () => {
    const { el } = await render({});
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.word')?.textContent).toBe('KinetiX');
  });
});
