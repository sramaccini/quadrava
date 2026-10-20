import { TestBed } from '@angular/core/testing';
import type { ThemeBrand } from 'schema';
import { AppBrandComponent } from './app-brand.component';

describe('brand of the application (lc-app-brand)', () => {
  function render(brand: ThemeBrand, tone: 'light' | 'dark' = 'light', compact = false) {
    const fixture = TestBed.createComponent(AppBrandComponent);
    fixture.componentRef.setInput('brand', brand);
    fixture.componentRef.setInput('tone', tone);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, img: () => el.querySelector('img'), name: () => el.querySelector('.name')?.textContent?.trim() ?? null };
  }

  it('the logo, named for screen readers; the variant for a dark side bar; the icon when collapsed', () => {
    const brand = { name: 'Staff', logo: 'images/logo.svg', logoOnDark: 'images/logo-white.svg', icon: 'images/icon.svg', height: 40 };
    const light = render(brand);
    expect(light.img()?.getAttribute('src')).toBe('images/logo.svg');
    expect(light.img()?.style.height).toBe('40px');
    expect(light.el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Staff');
    expect(light.name()).toBeNull();
    expect(render(brand, 'dark').img()?.getAttribute('src')).toBe('images/logo-white.svg');
    expect(render(brand, 'light', true).img()?.getAttribute('src')).toBe('images/icon.svg');
    expect(render({ name: 'Staff', logo: 'images/logo.svg' }, 'dark', true).img()?.getAttribute('src')).toBe('images/logo.svg');
  });

  it('the name next to a logo with showName, or alone without a logo; the initial in the collapsed bar', () => {
    expect(render({ name: 'Staff', logo: 'images/mark.svg', showName: true }).name()).toBe('Staff');
    const text = render({ name: 'Staff' });
    expect(text.img()).toBeNull();
    expect(text.name()).toBe('Staff');
    expect(render({ name: 'staff' }, 'light', true).el.querySelector('.initial')?.textContent?.trim()).toBe('S');
  });

  it('an address that is not allowed is not shown, and an image that does not load leaves the name', () => {
    const unsafe = render({ name: 'Staff', logo: 'javascript:alert(1)' });
    expect(unsafe.img()).toBeNull();
    expect(unsafe.name()).toBe('Staff');
    const broken = render({ name: 'Staff', logo: 'images/missing.svg' });
    broken.img()!.dispatchEvent(new Event('error'));
    broken.fixture.detectChanges();
    expect(broken.img()).toBeNull();
    expect(broken.name()).toBe('Staff');
  });
});
