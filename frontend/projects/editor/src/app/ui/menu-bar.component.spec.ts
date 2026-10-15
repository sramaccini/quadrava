import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MenuBarComponent, type Menu } from './menu-bar.component';

@Component({
  imports: [MenuBarComponent],
  template: `<button id="before" type="button">before</button><ed-menu-bar [menus]="menus()" label="Menu" />`,
})
class Host {
  readonly log: string[] = [];
  readonly menus = signal<Menu[]>([
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New', run: () => this.log.push('new') },
        {
          id: 'open',
          label: 'Open example',
          children: [
            { id: 'a', label: 'one', run: () => this.log.push('a') },
            { id: 'b', label: 'two', run: () => this.log.push('b') },
          ],
        },
        { id: 'empty', label: 'Empty', emptyLabel: 'No example', children: [] },
        { id: 'off', label: 'Off', disabled: true, run: () => this.log.push('off') },
        { id: 'save', label: 'Save', separator: true, shortcut: 'Ctrl+S', run: () => this.log.push('save') },
      ],
    },
    { id: 'edit', label: 'Edit', items: [{ id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', run: () => this.log.push('undo') }] },
  ]);
}

describe('menu bar', () => {
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

  it('ARIA roles, a single title reachable with Tab, separators and shortcuts', async () => {
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
    // A click on the open title closes.
    title('file').click();
    await settle();
    expect(item('new')).toBeNull();
  });

  it('from the keyboard: opens, moves skipping the disabled items, enters the submenu, runs and goes back to the previous point', async () => {
    (el.querySelector('#before') as HTMLButtonElement).focus();
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

  it('Esc closes and brings the focus back to the title; with a menu open the arrows move to the next menu', async () => {
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

  it('with the mouse: hovering another title changes the menu; disabled items and an empty submenu run nothing', async () => {
    const outsideButton = el.querySelector('#before') as HTMLButtonElement;
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
    expect(el.querySelector('.empty')?.textContent).toBe('No example');
    expect(fixture.componentInstance.log).toEqual([]);
    item('save')!.click();
    await settle();
    expect(fixture.componentInstance.log).toEqual(['save']);
    // Opened with the mouse, after the command the focus goes back where it was.
    expect(document.activeElement).toBe(outsideButton);
  });
});
