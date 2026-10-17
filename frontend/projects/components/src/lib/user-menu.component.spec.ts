import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLowcodeComponents } from './provide';
import { UserMenuComponent } from './user-menu.component';

describe('UserMenuComponent', () => {
  const flush = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const menuItems = (): string[] => [...document.querySelectorAll('.ant-dropdown li.ant-dropdown-menu-item, .ant-dropdown li[nz-menu-item]')].map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());

  async function render(items = [{ id: 'permissions', label: '4 permissions', icon: 'safety', disabled: true }, { id: 'profile', label: 'Profile', icon: 'user' }]) {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.componentRef.setInput('name', 'mario');
    fixture.componentRef.setInput('items', items);
    const selected: string[] = [];
    let logouts = 0;
    fixture.componentInstance.select.subscribe((id) => selected.push(id));
    fixture.componentInstance.logout.subscribe(() => logouts++);
    await flush(fixture);
    (fixture.nativeElement.querySelector('button.trigger') as HTMLButtonElement).click();
    for (let i = 0; i < 40 && menuItems().length === 0; i++) await flush(fixture);
    return { fixture, selected, logouts: () => logouts };
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('shows initial and name, and logout is the last item', async () => {
    const { fixture } = await render();
    expect(fixture.nativeElement.querySelector('nz-avatar')?.textContent?.trim()).toBe('M');
    expect(fixture.nativeElement.querySelector('.name')?.textContent?.trim()).toBe('mario');
    const items = menuItems();
    expect(items.at(-1)).toBe('Sign out');
    expect(items).toEqual(['4 permissions', 'Profile', 'Sign out']);
  });

  it('emits the chosen item, ignores disabled ones and reports logout', async () => {
    const { selected, logouts } = await render();
    const all = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    all[0].click();
    all[1].click();
    all[2].click();
    expect(selected).toEqual(['profile']);
    expect(logouts()).toBe(1);
  });

  it('without other items it shows only the exit', async () => {
    await render([]);
    expect(menuItems()).toEqual(['Sign out']);
  });

  it('the name is shown as text, not as HTML', async () => {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.componentRef.setInput('name', '<img src=x onerror=alert(1)>');
    await flush(fixture);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
