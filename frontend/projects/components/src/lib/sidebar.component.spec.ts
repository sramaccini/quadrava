import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NavigationRuntime, type Authorization, type UserProvider, type VisibleLeaf } from 'core';
import type { NavigationDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';
import { openSelect, stubViewportHeight } from './select-testing';
import { SidebarComponent, type NavigateEvent } from './sidebar.component';

const definition: NavigationDefinition = {
  schemaVersion: '1.0',
  navigation: 'app',
  areas: [
    {
      id: 'entry',
      label: 'Entry',
      requires: 'invoices.invoice.create',
      items: [
        {
          id: 'new',
          label: 'New invoice',
          icon: 'file-plus',
          children: [
            { id: 'issued', label: 'Issued', screen: 'invoice-new', params: { type: 'issued' } },
            { id: 'from-order', label: 'From order', children: [{ id: 'choose', label: 'Choose order', screen: 'order-list' }] },
          ],
        },
        { id: 'drafts', label: 'Drafts', screen: 'invoice-list', params: { status: 'draft' } },
      ],
    },
    { id: 'browse', label: 'Browse', requires: 'invoices.invoice.read', items: [{ id: 'list', label: 'List', screen: 'invoice-list' }] },
  ],
};

describe('SidebarComponent', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());

  const permissions = signal(new Set<string>());
  const flush = async (fixture: ComponentFixture<unknown>): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
  };

  async function render(granted: string[]) {
    permissions.set(new Set(granted));
    TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] });
    const nav = new NavigationRuntime(definition, {
      authorization: { can: (p: string) => permissions().has(p) } as Authorization,
      userProvider: { user: () => ({}) } as UserProvider,
    });
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.componentRef.setInput('navigation', nav);
    fixture.componentRef.setInput('hrefFor', (uc: string, leaf: VisibleLeaf) => `/${uc}/${leaf.screen}`);
    const events: NavigateEvent[] = [];
    const changes: string[] = [];
    fixture.componentInstance.navigate.subscribe((e) => events.push(e));
    fixture.componentInstance.areaChange.subscribe((id) => changes.push(id));
    await flush(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement, events, changes };
  }

  const text = (n: Element | null | undefined): string => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** Labels of the first-level items. */
  const top = (el: HTMLElement): string[] =>
    [...el.querySelectorAll(':scope ul[nz-menu] > li')].map((li) => text(li.matches('.ant-menu-submenu') ? li.querySelector('.ant-menu-submenu-title') : li.querySelector('.label')));
  const openGroups = (el: HTMLElement): string[] => [...el.querySelectorAll('li.ant-menu-submenu-open > .ant-menu-submenu-title')].map((n) => text(n));
  const groupTitle = (el: HTMLElement, label: string): HTMLElement =>
    [...el.querySelectorAll<HTMLElement>('.ant-menu-submenu-title')].find((n) => text(n) === label)!;

  it('without a brand of its own (lcBrand) it shows the default icon and name, Quadrava when not given', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    expect(text(el.querySelector('.logo .name'))).toBe('Quadrava');
    expect(el.querySelector('.logo .mark')).not.toBeNull();
    fixture.componentRef.setInput('brand', 'Acme');
    fixture.componentRef.setInput('logo', 'acme.svg');
    await flush(fixture);
    expect(text(el.querySelector('.logo .name'))).toBe('Acme');
    expect(el.querySelector('.logo img')?.getAttribute('src')).toBe('acme.svg');
  });

  it('with a single area it does not show the selector', async () => {
    const { el } = await render(['invoices.invoice.create']);
    expect(el.querySelector('nz-select')).toBeNull();
    expect(top(el)).toEqual(['New invoice', 'Drafts']);
  });

  it('with several areas it shows the selector and reports the change', async () => {
    const { fixture, el, changes } = await render(['invoices.invoice.create', 'invoices.invoice.read']);
    // Next to the selector there is the same icon as in the collapsed bar; the label stays for screen readers only.
    expect(el.querySelector('.area .area-mark [nztype="appstore"], .area .area-mark .anticon-appstore')).not.toBeNull();
    expect(el.querySelector('.area label')?.classList.contains('visually-hidden')).toBe(true);
    expect(text(el.querySelector('.area label'))).toBe('Area');
    const options = await openSelect(el.querySelector('nz-select') as Element, () => flush(fixture));
    expect(options.map((o) => text(o))).toEqual(['Entry', 'Browse']);
    options[1].click();
    await flush(fixture);
    expect(changes).toEqual(['browse']);
    fixture.componentRef.setInput('areaId', 'browse');
    await flush(fixture);
    expect(top(el)).toEqual(['List']);
  });

  it('groups open and close, down to the third level', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    expect(openGroups(el)).toEqual([]);
    groupTitle(el, 'New invoice').click();
    await flush(fixture);
    expect(openGroups(el)).toEqual(['New invoice']);
    groupTitle(el, 'From order').click();
    await flush(fixture);
    expect(openGroups(el)).toEqual(['New invoice', 'From order']);
    expect(text(el)).toContain('Choose order');
    groupTitle(el, 'New invoice').click();
    await flush(fixture);
    expect(openGroups(el)).not.toContain('New invoice');
  });

  it('highlights the active item and opens its groups', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    fixture.componentRef.setInput('active', { screen: 'invoice-new', params: { type: 'issued' } });
    await flush(fixture);
    const current = el.querySelector('a[aria-current="page"]');
    expect(current?.textContent).toContain('Issued');
    expect(el.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(openGroups(el)).toEqual(['New invoice']);
    expect(el.querySelector('li.ant-menu-item-selected')).not.toBeNull();
  });

  it('links have an href and a plain click emits navigate without reloading', async () => {
    const { fixture, el, events } = await render(['invoices.invoice.create']);
    const drafts = [...el.querySelectorAll('a.leaf')].find((a) => a.textContent?.includes('Drafts')) as HTMLAnchorElement;
    expect(drafts.getAttribute('href')).toBe('/entry/invoice-list');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    drafts.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(events).toEqual([{ area: 'entry', leaf: expect.objectContaining({ id: 'drafts', screen: 'invoice-list', params: { status: 'draft' } }) }]);
    // Ctrl+click: the browser handles it
    const ctrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    drafts.dispatchEvent(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(events).toHaveLength(1);
    await flush(fixture);
  });

  it('a click on the edge of the row (outside the text) opens the item; the highlight follows only the open screen', async () => {
    const { fixture, el, events } = await render(['invoices.invoice.create']);
    fixture.componentRef.setInput('active', { screen: 'invoice-new', params: { type: 'issued' } });
    await flush(fixture);
    const row = [...el.querySelectorAll<HTMLElement>('li.ant-menu-item')].find((li) => li.textContent?.includes('Drafts'))!;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flush(fixture);
    expect(events.map((e) => e.leaf.id)).toEqual(['drafts']);
    // Until the screen changes, the open one stays highlighted (the click used to move the highlight by itself).
    const selected = () => [...el.querySelectorAll('li.ant-menu-item-selected')].map((li) => text(li.querySelector('.label')));
    expect(selected()).toEqual(['Issued']);
    fixture.componentRef.setInput('active', { screen: 'invoice-list', params: { status: 'draft' } });
    await flush(fixture);
    expect(selected()).toEqual(['Drafts']);
  });

  it('permissions taken away redraw the menu', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    permissions.set(new Set());
    await flush(fixture);
    expect(el.querySelector('nav')).toBeNull();
    expect(el.textContent).toContain('No functions available');
  });

  it('collapsed it shows only the icons and can be opened again', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    const toggle = el.querySelector('button.toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    await flush(fixture);
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(true);
    expect(el.querySelector('ul[nz-menu]')?.classList.contains('ant-menu-inline-collapsed')).toBe(true);
    // Items stay reachable from the keyboard and for screen readers thanks to aria-label.
    expect(el.querySelector('a.leaf')?.getAttribute('aria-label')).toBe('Drafts');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await flush(fixture);
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(false);
  });

  it('can be collapsed from outside and without its own button', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    fixture.componentRef.setInput('showToggle', false);
    await flush(fixture);
    expect(el.querySelector('button.toggle')).toBeNull();
    fixture.componentRef.setInput('collapsed', true);
    await flush(fixture);
    expect(el.querySelector('.side')?.classList.contains('collapsed')).toBe(true);
  });

  it('collapsed, the area selector becomes an icon with a drop-down menu', async () => {
    const { fixture, el, changes } = await render(['invoices.invoice.create', 'invoices.invoice.read']);
    expect(el.querySelector('nz-select')).not.toBeNull();
    fixture.componentRef.setInput('collapsed', true);
    await flush(fixture);
    expect(el.querySelector('nz-select')).toBeNull();
    const trigger = el.querySelector('button.area-trigger') as HTMLButtonElement;
    expect(trigger.querySelector('[nztype="appstore"], .anticon-appstore')).not.toBeNull();
    expect(trigger.getAttribute('aria-label')).toBe('Area: Entry');
    trigger.click();
    for (let i = 0; i < 40 && document.querySelectorAll('.ant-dropdown li[nz-menu-item]').length === 0; i++) await flush(fixture);
    const items = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    expect(items.map((n) => text(n))).toEqual(['Entry', 'Browse']);
    items[1].click();
    expect(changes).toEqual(['browse']);
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  describe('search, counters and keyboard', () => {
    const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

    it('search shows the items containing the text (ignoring accents and case), with their path; Enter opens the first', async () => {
      const { fixture, el, events } = await render(['invoices.invoice.create']);
      const input = el.querySelector('.search input') as HTMLInputElement;
      input.value = 'ISSUED';
      input.dispatchEvent(new Event('input'));
      await flush(fixture);
      expect(el.querySelector('nav')).toBeNull();
      expect([...el.querySelectorAll('.results a')].map((a) => text(a))).toEqual(['Issued New invoice']);
      // The group name counts too: «new» finds its items.
      input.value = 'new';
      input.dispatchEvent(new Event('input'));
      await flush(fixture);
      expect([...el.querySelectorAll('.results a')].map((a) => text(a))).toEqual(['Issued New invoice', 'Choose order New invoice › From order']);
      key(input, 'Enter');
      await flush(fixture);
      expect(events.map((e) => e.leaf.id)).toEqual(['issued']);
      expect(input.value).toBe('');
      expect(el.querySelector('nav')).not.toBeNull();
      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      await flush(fixture);
      expect(text(el.querySelector('.results [role="status"]'))).toBe('No matching items.');
      key(input, 'Escape');
      await flush(fixture);
      expect(el.querySelector('.results')).toBeNull();
    });

    it('counters next to the items, also read by screen readers; above 99 «99+»', async () => {
      const { fixture, el } = await render(['invoices.invoice.create']);
      fixture.componentRef.setInput('badges', { drafts: 3, issued: 120 });
      await flush(fixture);
      const drafts = [...el.querySelectorAll('a.leaf')].find((a) => a.textContent?.includes('Drafts'))!;
      expect(text(drafts.querySelector('.badge'))).toBe('3');
      expect(text(drafts.querySelector('.visually-hidden'))).toBe(', 3 to handle');
      fixture.componentRef.setInput('collapsed', true);
      await flush(fixture);
      expect(drafts.getAttribute('aria-label')).toBe('Drafts, 3 to handle');
    });

    it('group titles are reachable from the keyboard and say whether they are open; arrows, Home/End, right and left', async () => {
      const { fixture, el } = await render(['invoices.invoice.create']);
      const title = el.querySelector('.ant-menu-submenu-title') as HTMLElement;
      expect([title.getAttribute('tabindex'), title.getAttribute('role'), title.getAttribute('aria-expanded')]).toEqual(['0', 'button', 'false']);
      title.focus();
      key(title, 'ArrowRight');
      await flush(fixture);
      expect(title.getAttribute('aria-expanded')).toBe('true');
      // Open: down enters the first item, then the subgroup.
      key(title, 'ArrowDown');
      expect(text(document.activeElement)).toBe('Issued');
      key(document.activeElement!, 'ArrowDown');
      expect(text(document.activeElement)).toBe('From order');
      // Left from an item goes back to the group containing it.
      key(el.querySelector('a.leaf')!, 'ArrowLeft');
      expect(document.activeElement).toBe(title);
      key(title, 'End');
      expect(text(document.activeElement)).toBe('Drafts');
      key(document.activeElement!, 'Home');
      expect(document.activeElement).toBe(title);
      key(title, 'Enter');
      await flush(fixture);
      expect(title.getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('counters on closed groups: the sum of their items (subgroups included); once open, the numbers move to the items', async () => {
    const { fixture, el } = await render(['invoices.invoice.create']);
    fixture.componentRef.setInput('badges', { issued: 2, choose: 3, drafts: 1 });
    await flush(fixture);
    const title = () => el.querySelector('li[data-group="new"] > .ant-menu-submenu-title') as HTMLElement;
    expect(title().getAttribute('data-lc-badge')).toBe('5');
    expect(title().getAttribute('aria-label')).toBe('New invoice, 5 to handle');
    title().click();
    await flush(fixture);
    expect(title().getAttribute('data-lc-badge')).toBeNull();
    expect(title().getAttribute('aria-label')).toBeNull();
    // The closed subgroup shows its own.
    expect(el.querySelector('li[data-group="from-order"] > .ant-menu-submenu-title')?.getAttribute('data-lc-badge')).toBe('3');
    // With the bar collapsed the counter stays on the group even if it was open.
    fixture.componentRef.setInput('collapsed', true);
    await flush(fixture);
    expect(title().getAttribute('data-lc-badge')).toBe('5');
  });
});
