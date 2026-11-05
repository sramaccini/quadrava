import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { Confirmation, I18n } from 'core';
import { provideLowcodeComponents } from './provide';
import { UserMenuComponent, type UserMenuChoices, type UserMenuItem } from './user-menu.component';

describe('UserMenuComponent', () => {
  const flush = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const menuItems = (): string[] => [...document.querySelectorAll('.ant-dropdown li.ant-dropdown-menu-item, .ant-dropdown li[nz-menu-item]')].map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());

  async function render(items: readonly UserMenuItem[] = [{ id: 'permissions', label: '4 permissions', icon: 'safety', disabled: true }, { id: 'profile', label: 'Profile', icon: 'user' }], choices?: UserMenuChoices, locale = 'en') {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    TestBed.inject(I18n).setLocale(locale);
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.componentRef.setInput('name', 'mario');
    fixture.componentRef.setInput('items', items);
    if (choices) fixture.componentRef.setInput('choices', choices);
    const selected: string[] = [];
    const chosen: string[] = [];
    let logouts = 0;
    fixture.componentInstance.select.subscribe((id) => selected.push(id));
    fixture.componentInstance.choice.subscribe((id) => chosen.push(id));
    fixture.componentInstance.logout.subscribe(() => logouts++);
    await flush(fixture);
    (fixture.nativeElement.querySelector('button.trigger') as HTMLButtonElement).click();
    for (let i = 0; i < 40 && menuItems().length === 0; i++) await flush(fixture);
    return { fixture, selected, chosen, logouts: () => logouts };
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('shows the initial, with the name in the tooltip and the accessible name, and logout is the last item', async () => {
    const { fixture } = await render();
    const trigger = fixture.nativeElement.querySelector('button.trigger') as HTMLElement;
    expect(trigger.textContent?.trim()).toBe('M');
    expect(trigger.getAttribute('aria-label')).toBe('User menu mario');
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    for (let i = 0; i < 40 && !document.querySelector('.ant-tooltip-inner'); i++) await flush(fixture);
    expect(document.querySelector('.ant-tooltip-inner')?.textContent?.trim()).toBe('User: mario');
    const items = menuItems();
    expect(items.at(-1)).toBe('Sign out');
    expect(items).toEqual(['4 permissions', 'Profile', 'Sign out']);
  });

  it('emits the chosen item, ignores disabled ones and reports logout only once confirmed', async () => {
    const { fixture, selected, logouts } = await render();
    const all = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    all[0].click();
    all[1].click();
    expect(selected).toEqual(['profile']);
    const confirm = vi.spyOn(TestBed.inject(Confirmation), 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    all[2].click();
    await flush(fixture);
    expect(confirm).toHaveBeenCalledWith('Sign out of the application?');
    expect(logouts()).toBe(0);
    all[2].click();
    await flush(fixture);
    expect(logouts()).toBe(1);
  });

  it('without other items it shows only the exit', async () => {
    await render([]);
    expect(menuItems()).toEqual(['Sign out']);
  });

  it('translates sign out to the active language', async () => {
    await render([], undefined, 'it');
    expect(menuItems()).toEqual(['Disconnetti']);
  });

  it('opens a nested settings group and emits the selected setting', async () => {
    const { fixture, selected } = await render([{ id: 'settings', label: 'Settings', children: [{ id: 'theme:dark', label: 'Theme · Dark', selected: true }] }]);
    const group = [...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-submenu-title')].find((item) => item.textContent?.trim() === 'Settings');
    group?.click();
    await flush(fixture);
    const option = [...document.querySelectorAll<HTMLElement>('li[nz-menu-item]')].find((item) => item.textContent?.trim() === 'Theme · Dark');
    expect(option).toBeTruthy();
    option?.click();
    expect(selected).toEqual(['theme:dark']);
  });

  it('a group of choices comes first, marks the current one and emits only the others', async () => {
    const tenants = { label: 'Tenant', items: [{ id: 'north', label: 'North office' }, { id: 'south', label: 'South office' }], selected: 'north' };
    const { chosen, selected } = await render([{ id: 'profile', label: 'Profile' }], tenants);
    expect(menuItems()).toEqual(['North office', 'South office', 'Profile', 'Sign out']);
    expect(document.querySelector('.ant-dropdown .ant-dropdown-menu-item-group-title')?.textContent?.trim()).toBe('Tenant');
    const radios = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[role="menuitemradio"]')];
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(document.querySelector('.ant-dropdown ul[role="group"]')?.getAttribute('aria-label')).toBe('Tenant');
    radios[0].click();
    radios[1].click();
    expect(chosen).toEqual(['south']);
    expect(selected).toEqual([]);
  });

  it('is a menu that works from the keyboard: roles, focus on the first item, arrows, Enter, focus back on the icon', async () => {
    const { fixture, selected } = await render();
    const menu = document.querySelector<HTMLElement>('.ant-dropdown ul[role="menu"]')!;
    expect(menu.getAttribute('aria-label')).toBe('User menu');
    const items = [...menu.querySelectorAll<HTMLElement>('li[nz-menu-item]')];
    expect(items.map((i) => i.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'menuitem']);
    expect(items[0].getAttribute('aria-disabled')).toBe('true');
    expect(menu.querySelector('li.ant-dropdown-menu-item-divider')?.getAttribute('role')).toBe('separator');
    const trigger = fixture.nativeElement.querySelector('button.trigger') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // The disabled item is skipped: the focus starts on «Profile».
    for (let i = 0; i < 40 && document.activeElement !== items[1]; i++) await flush(fixture);
    expect(document.activeElement).toBe(items[1]);
    const press = (key: string): void => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown');
    expect(document.activeElement).toBe(items[2]);
    press('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    press('End');
    expect(document.activeElement).toBe(items[2]);
    press('Home');
    press('Enter');
    expect(selected).toEqual(['profile']);
    for (let i = 0; i < 40 && document.activeElement !== trigger; i++) await flush(fixture);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a submenu from the keyboard on its first item and closes it with the left arrow', async () => {
    const { fixture, selected } = await render([{ id: 'settings', label: 'Settings', children: [{ id: 'theme:dark', label: 'Theme · Dark' }] }]);
    const title = document.querySelector<HTMLElement>('.ant-dropdown [data-submenu="settings"] > .ant-dropdown-menu-submenu-title')!;
    for (let i = 0; i < 40 && document.activeElement !== title; i++) await flush(fixture);
    expect(title.getAttribute('role')).toBe('menuitem');
    expect(title.getAttribute('aria-haspopup')).toBe('menu');
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const option = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-submenu-of="settings"] li[role="menuitem"]');
    for (let i = 0; i < 40 && (!option() || document.activeElement !== option()); i++) await flush(fixture);
    expect(document.activeElement).toBe(option());
    option()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(title);
    title.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (let i = 0; i < 40 && document.activeElement !== option(); i++) await flush(fixture);
    option()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(selected).toEqual(['theme:dark']);
  });

  it('the name is shown as text, not as HTML', async () => {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.componentRef.setInput('name', '<img src=x onerror=alert(1)>');
    await flush(fixture);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
