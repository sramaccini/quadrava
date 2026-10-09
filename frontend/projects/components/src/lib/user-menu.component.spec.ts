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

  async function render(items = [{ id: 'permessi', label: '4 permessi', icon: 'safety', disabled: true }, { id: 'profilo', label: 'Profilo', icon: 'user' }]) {
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

  it('mostra iniziale e nome, e il logout è l’ultima voce', async () => {
    const { fixture } = await render();
    expect(fixture.nativeElement.querySelector('nz-avatar')?.textContent?.trim()).toBe('M');
    expect(fixture.nativeElement.querySelector('.name')?.textContent?.trim()).toBe('mario');
    const items = menuItems();
    expect(items.at(-1)).toBe('Esci');
    expect(items).toEqual(['4 permessi', 'Profilo', 'Esci']);
  });

  it('emette la voce scelta, ignora quelle disabilitate e segnala il logout', async () => {
    const { selected, logouts } = await render();
    const all = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    all[0].click();
    all[1].click();
    all[2].click();
    expect(selected).toEqual(['profilo']);
    expect(logouts()).toBe(1);
  });

  it('senza altre voci mostra solo l’uscita', async () => {
    await render([]);
    expect(menuItems()).toEqual(['Esci']);
  });

  it('il nome è mostrato come testo, non come HTML', async () => {
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.componentRef.setInput('name', '<img src=x onerror=alert(1)>');
    await flush(fixture);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
