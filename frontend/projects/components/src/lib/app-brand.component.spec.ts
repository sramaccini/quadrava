import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationRuntime, type Authorization, type UserProvider } from 'core';
import type { ThemeBrand } from 'schema';
import { AppBrandComponent } from './app-brand.component';
import { provideLowcodeComponents } from './provide';
import { SidebarComponent } from './sidebar.component';

/** A side bar with the brand of a theme, as the previews of Studio put it: without saying whether it is collapsed. */
@Component({
  imports: [AppBrandComponent, SidebarComponent],
  template: `
    <lc-sidebar [navigation]="nav" [(collapsed)]="collapsed">
      <lc-app-brand lcBrand [brand]="brand" />
    </lc-sidebar>
  `,
})
class BrandInSidebar {
  readonly nav = new NavigationRuntime(
    { schemaVersion: '1.0', navigation: 'app', areas: [{ id: 'main', label: 'Main', items: [{ id: 'list', label: 'List', screen: 'list' }] }] },
    { authorization: { can: () => true } as Authorization, userProvider: { user: () => ({}) } as UserProvider },
  );
  readonly collapsed = signal(false);
  readonly brand: ThemeBrand = { name: 'Staff', logo: 'images/logo.svg', icon: 'images/icon.svg' };
}

describe('brand of the application inside the side bar', () => {
  it('follows the collapsed state of the bar by itself: the icon when collapsed', async () => {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const fixture = TestBed.createComponent(BrandInSidebar);
    fixture.detectChanges();
    await fixture.whenStable();
    const src = (): string | null | undefined => (fixture.nativeElement as HTMLElement).querySelector('lc-app-brand img')?.getAttribute('src');
    expect(src()).toBe('images/logo.svg');
    fixture.componentInstance.collapsed.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(src()).toBe('images/icon.svg');
  });
});

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
