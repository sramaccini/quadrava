import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MenuBarComponent, type Menu } from './menu-bar.component';

@Component({
  imports: [MenuBarComponent],
  template: `<button id="prima" type="button">prima</button><ed-menu-bar [menus]="menus()" label="Menu" />`,
})
class Host {
  readonly log: string[] = [];
  readonly menus = signal<Menu[]>([
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'Nuova', run: () => this.log.push('new') },
        {
          id: 'open',
          label: 'Apri esempio',
          children: [
            { id: 'a', label: 'uno', run: () => this.log.push('a') },
            { id: 'b', label: 'due', run: () => this.log.push('b') },
          ],
        },
        { id: 'empty', label: 'Vuoto', emptyLabel: 'Nessun esempio', children: [] },
        { id: 'off', label: 'Spento', disabled: true, run: () => this.log.push('off') },
        { id: 'save', label: 'Salva', separator: true, shortcut: 'Ctrl+S', run: () => this.log.push('save') },
      ],
    },
    { id: 'edit', label: 'Modifica', items: [{ id: 'undo', label: 'Annulla', shortcut: 'Ctrl+Z', run: () => this.log.push('undo') }] },
  ]);
}

describe('barra dei menu', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await settle();
  });
  afterEach(() => el.remove());

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const title = (id: string) => el.querySelector(`[data-menu="${id}"]`) as HTMLButtonElement;
  const item = (id: string) => el.querySelector(`[data-item="${id}"]`) as HTMLButtonElement | null;
  const focused = () => (document.activeElement as HTMLElement | null)?.dataset['item'] ?? (document.activeElement as HTMLElement | null)?.dataset['menu'];
  const key = async (k: string): Promise<void> => {
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    await settle();
  };

  it('ruoli ARIA, un solo titolo raggiungibile con Tab, separatori e scorciatoie', async () => {
    expect(el.querySelector('[role="menubar"]')?.getAttribute('aria-label')).toBe('Menu');
    expect([title('file').tabIndex, title('edit').tabIndex]).toEqual([0, -1]);
    expect(title('file').getAttribute('aria-haspopup')).toBe('menu');
    title('file').click();
    await settle();
    expect(title('file').getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[role="menu"]')?.getAttribute('aria-labelledby')).toBe('ed-menu-file');
    expect(el.querySelectorAll('[role="separator"]').length).toBe(1);
    expect(item('save')?.querySelector('.shortcut')?.textContent).toBe('Ctrl+S');
    expect(item('open')?.getAttribute('aria-haspopup')).toBe('menu');
    // Un clic sul titolo aperto chiude.
    title('file').click();
    await settle();
    expect(item('new')).toBeNull();
  });

  it('da tastiera: apre, scorre saltando le voci spente, entra nel sottomenu, esegue e torna al punto di prima', async () => {
    (el.querySelector('#prima') as HTMLButtonElement).focus();
    title('file').focus();
    await key('ArrowRight');
    expect(focused()).toBe('edit');
    await key('ArrowLeft');
    await key('ArrowDown');
    expect(focused()).toBe('new');
    await key('ArrowUp');
    expect(focused()).toBe('save');
    await key('ArrowUp');
    expect(focused()).toBe('empty');
    await key('Home');
    await key('ArrowDown');
    expect(focused()).toBe('open');
    await key('ArrowRight');
    expect(focused()).toBe('a');
    await key('ArrowDown');
    expect(focused()).toBe('b');
    await key('ArrowLeft');
    expect(focused()).toBe('open');
    expect(item('b')).toBeNull();
    await key('Enter');
    expect(focused()).toBe('a');
    item('a')!.click();
    await settle();
    expect(fixture.componentInstance.log).toEqual(['a']);
    expect(item('new')).toBeNull();
    expect(focused()).toBe('file');
  });

  it('Esc chiude e riporta il fuoco al titolo; a menu aperto le frecce passano al menu accanto', async () => {
    title('file').focus();
    await key('Enter');
    expect(focused()).toBe('new');
    await key('ArrowRight');
    expect(focused()).toBe('undo');
    expect(title('edit').getAttribute('aria-expanded')).toBe('true');
    expect(title('edit').tabIndex).toBe(0);
    await key('Escape');
    expect(item('undo')).toBeNull();
    expect(focused()).toBe('edit');
  });

  it('con il mouse: passando su un altro titolo il menu cambia; voci spente e sottomenu vuoto non eseguono nulla', async () => {
    const outsideButton = el.querySelector('#prima') as HTMLButtonElement;
    outsideButton.focus();
    title('file').click();
    await settle();
    title('edit').dispatchEvent(new Event('pointerenter'));
    await settle();
    expect(item('undo')).not.toBeNull();
    title('file').dispatchEvent(new Event('pointerenter'));
    await settle();
    item('off')!.click();
    item('empty')!.dispatchEvent(new Event('pointerenter'));
    await settle();
    expect(el.querySelector('.empty')?.textContent).toBe('Nessun esempio');
    expect(fixture.componentInstance.log).toEqual([]);
    item('save')!.click();
    await settle();
    expect(fixture.componentInstance.log).toEqual(['save']);
    // Aperto con il mouse, dopo il comando il fuoco torna dov'era.
    expect(document.activeElement).toBe(outsideButton);
  });
});
