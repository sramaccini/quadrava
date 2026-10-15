import { Location } from '@angular/common';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import detail from '../../public/examples/order-detail.json';
import list from '../../public/examples/order-list.json';
import navigationDoc from '../../public/examples/navigation.json';
import invoices from '../../public/examples/invoice-list.json';
import newInvoice from '../../public/examples/invoice-new.json';
import newPackage from '../../public/examples/package-new.json';
import packages from '../../public/examples/package-list.json';
import expenses from '../../public/examples/expense-list.json';
import light from '../../public/examples/themes/light.json';
import dark from '../../public/examples/themes/dark.json';
import { DemoDiagnostics } from '../demo/demo-ports';
import { NavigationService } from './navigation.service';
import { openSelect, stubViewportHeight } from './select-testing';
import { App } from './app';
import { appConfig } from './app.config';

/** End-to-end test of the demo: menu, router, real JSON screens, fake ports, standard catalogue and themes. */
describe('App (demo)', () => {
  const files: Record<string, unknown> = {
    'examples/navigation.json': navigationDoc,
    'examples/order-list.json': list,
    'examples/order-detail.json': detail,
    'examples/invoice-list.json': invoices,
    'examples/invoice-new.json': newInvoice,
    'examples/package-new.json': newPackage,
    'examples/package-list.json': packages,
    'examples/expense-list.json': expenses,
    'examples/themes/light.json': light,
    'examples/themes/dark.json': dark,
  };

  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());

  beforeEach(() => {
    // Demo language fixed: jsdom declares an English browser.
    localStorage.setItem('lc.language', 'it');
    vi.stubGlobal('fetch', async (url: string) => {
      const body = files[url];
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({}) };
    });
    TestBed.configureTestingModule({ providers: appConfig.providers });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
    document.body.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
    document.getElementById('lc-nz-dark-theme')?.remove();
  });

  async function until(fixture: ComponentFixture<App>, condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\nURL: ${TestBed.inject(Location).path()}\n${(fixture.nativeElement as HTMLElement).innerHTML.slice(0, 1800)}`);
  }

  async function start(user = 'operator'): Promise<{ fixture: ComponentFixture<App>; el: HTMLElement; url: () => string }> {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    const url = (): string => TestBed.inject(Location).path();
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    if (user !== 'operator') {
      await until(fixture, () => !!headerSelect(el, 0), 'top bar');
      await choose(fixture, headerSelect(el, 0), user);
    }
    return { fixture, el, url };
  }

  const buttonsOf = (el: HTMLElement): string[] => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  const headerSelect = (el: HTMLElement, index: number): HTMLElement => el.querySelectorAll('nz-header nz-select')[index] as HTMLElement;
  const areaSelect = (el: HTMLElement): HTMLElement | null => el.querySelector('lc-sidebar nz-select');
  /** Areas offered to the user (read from the menu state, not from the drop-down). */
  const areas = (): string[] => TestBed.inject(NavigationService).runtime()?.areas().map((u) => u.label) ?? [];
  const sideLabels = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('lc-sidebar a.leaf .label, lc-sidebar .ant-menu-submenu-title')].map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim());
  /** Chooses an item of an NG-ZORRO drop-down from its text. */
  const choose = async (fixture: ComponentFixture<App>, select: HTMLElement, label: string): Promise<void> => {
    const options = await openSelect(select, async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    });
    (options.find((o) => (o.textContent ?? '').trim() === label) as HTMLElement).click();
  };
  const toast = (): Element | null => document.body.querySelector('.ant-message-notice');
  const clickLabel = (el: HTMLElement, selector: string, text: string): void => {
    ([...el.querySelectorAll(selector)].find((n) => n.textContent?.trim().startsWith(text)) as HTMLElement).click();
  };
  const heading = (el: HTMLElement): string | undefined => el.querySelector('h1')?.textContent?.trim();
  const rows = (el: HTMLElement): number => el.querySelectorAll('main tbody tr:not(.ant-table-placeholder)').length;

  it('at start-up it opens the default area and applies the theme', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    expect(url()).toBe('/invoice-lookup/invoice-list');
    expect(heading(el)).toBe('Invoices');
    expect(document.documentElement.style.getPropertyValue('--lc-color-primary')).toBe('#1f5fbf');
    expect(el.querySelector('lc-sidebar a[aria-current="page"]')?.textContent).toContain('Invoice list');
  });

  it('on a narrow screen the menu is in a drawer and the demo settings in a menu', async () => {
    // jsdom has no matchMedia: it is simulated with a window 390px wide.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: /min-width: (\d+)px/.test(query) && 390 >= Number(/min-width: (\d+)px/.exec(query)![1]),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    const { fixture, el, url } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    expect(el.querySelector('lc-sidebar')).toBeNull();
    expect(el.querySelector('nz-header nz-select')).toBeNull();
    // Here the demo catalogues are not loaded: it is enough that the button has an accessible name.
    expect(el.querySelector('nz-header button.settings-button')?.getAttribute('aria-label')).toBeTruthy();
    const menuButton = el.querySelector('nz-header button.menu-button') as HTMLButtonElement;
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    menuButton.click();
    await until(fixture, () => !!document.querySelector('.lc-sider-drawer lc-sidebar a.leaf'), 'drawer open');
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    // In the drawer the bar is always expanded and without the round button.
    expect(document.querySelector('.lc-sider-drawer lc-sidebar .side')?.classList.contains('collapsed')).toBe(false);
    expect(document.querySelector('.lc-sider-drawer lc-sidebar button.toggle')).toBeNull();
    clickLabel(document.body, '.lc-sider-drawer lc-sidebar .ant-menu-submenu-title', 'Linked orders');
    await until(fixture, () => [...document.querySelectorAll('.lc-sider-drawer a.leaf')].some((a) => a.textContent?.trim() === 'Orders'), 'group open');
    clickLabel(document.body, '.lc-sider-drawer lc-sidebar a.leaf', 'Orders');
    await until(fixture, () => url().startsWith('/invoice-lookup/order-list'), 'navigation from the drawer');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('the page header shows the breadcrumbs from the menu and the logo sits above the menu', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    const crumbs = [...el.querySelectorAll('main nz-breadcrumb-item')].map((n) => (n.textContent ?? '').replace('/', '').trim());
    expect(crumbs).toEqual(['Invoice lookup', 'Invoice list']);
    // The Quadrava brand: icon and logotype, with the name for screen readers; with the bar collapsed the icon stays.
    const brand = el.querySelector('lc-sidebar .logo lc-quadrava-wordmark') as HTMLElement;
    expect(brand.querySelector('img')?.getAttribute('src')).toBe('brand/quadrava-icon-small.svg');
    expect(brand.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Quadrava');
    expect(brand.querySelector('.word')?.textContent).toBe('Quadrava');
    expect(el.querySelector('lc-sidebar .logo .name')).toBeNull();
    (el.querySelector('lc-sidebar button.toggle') as HTMLButtonElement).click();
    await until(fixture, () => !brand.querySelector('.word'), 'collapsed bar');
    expect(brand.querySelector('img')).not.toBeNull();
  });

  it('the user menu shows the name and ends the session with the last item, then one can sign in again', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    expect(el.querySelector('lc-user-menu .name')?.textContent?.trim()).toBe('operator');
    (el.querySelector('lc-user-menu button.trigger') as HTMLButtonElement).click();
    await until(fixture, () => document.querySelectorAll('.ant-dropdown li[nz-menu-item]').length > 0, 'user menu');
    const items = [...document.querySelectorAll<HTMLElement>('.ant-dropdown li[nz-menu-item]')];
    expect(items.at(-1)?.textContent?.trim()).toBe('Esci');
    items.at(-1)!.click();
    await until(fixture, () => !!el.querySelector('.signed-out'), 'session ended');
    expect(el.querySelector('lc-sidebar')).toBeNull();
    (el.querySelector('.signed-out button') as HTMLButtonElement).click();
    await until(fixture, () => !el.querySelector('.signed-out'), 'signed in again');
  });

  it('the areas depend on the permissions of the profile', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => areas().length > 0, 'selector');
    expect(areas()).toEqual(['Invoice entry', 'Invoice lookup', 'Component showcase']);
    await choose(fixture, headerSelect(el, 0), 'manager');
    await until(fixture, () => areas().length === 5, 'four areas');
    expect(areas()).toEqual(['Invoice entry', 'Invoice lookup', 'Package creation', 'Expense review', 'Component showcase']);
  });

  it('changing area goes to its first item and updates the URL', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => areas().length > 0, 'selector');
    await choose(fixture, areaSelect(el)!, 'Invoice entry');
    await until(fixture, () => heading(el) === 'New invoice', 'new invoice form');
    expect(url()).toBe('/invoice-entry/invoice-new?type=sales');
    // the type comes from the parameters of the menu item
    expect(el.querySelector('main nz-select .ant-select-selection-item')?.textContent?.trim()).toBe('sales');
    // the menu shows the three levels: group, subgroup, item
    expect(sideLabels(el)).toContain('Purchase invoice');
    clickLabel(el, 'lc-sidebar .ant-menu-submenu-title', 'From order');
    await until(fixture, () => sideLabels(el).includes('Choose the order'), 'third level');
  });

  it('entering an invoice saves it as a draft and goes to the list of drafts', async () => {
    const { fixture, el, url } = await start();
    await until(fixture, () => areas().length > 0, 'selector');
    await choose(fixture, areaSelect(el)!, 'Invoice entry');
    await until(fixture, () => heading(el) === 'New invoice', 'new invoice form');
    const input = (name: string): HTMLInputElement => [...el.querySelectorAll('main input')].find((i) => i.id.endsWith(`-${name}`)) as HTMLInputElement;
    const type = (name: string, value: string): void => {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
    };
    // without the required data saving does not start and the errors appear
    (el.querySelector('main .actions button') as HTMLButtonElement).click();
    await until(fixture, () => el.querySelectorAll('main .ant-form-item-explain-error').length > 0, 'validation errors');
    type('number', 'FT-2026-900');
    type('customer', 'Yellow Ltd');
    type('amount', '1200');
    (el.querySelector('main .actions button') as HTMLButtonElement).click();
    await until(fixture, () => heading(el) === 'Invoices' && rows(el) > 0, 'list of drafts');
    expect(url()).toBe('/invoice-entry/invoice-list?status=draft');
    expect(el.querySelector('main')?.textContent).toContain('FT-2026-900');
    // with a fixed ?status the filter does not appear
    expect(el.querySelector('main nz-select')).toBeNull();
  });

  it('expense review: item with parameters, approval and message', async () => {
    const { fixture, el, url } = await start('manager');
    await until(fixture, () => areas().length === 5, 'four areas');
    await choose(fixture, areaSelect(el)!, 'Expense review');
    await until(fixture, () => rows(el) > 0, 'expense list');
    expect(url()).toBe('/expense-review/expense-list?status=to-review');
    const before = rows(el);
    expect(buttonsOf(el)).toContain('Reject');
    clickLabel(el, 'main button', 'Approve');
    await until(fixture, () => !!toast(), 'confirmation');
    expect(toast()?.textContent).toContain('Expense approved');
    await until(fixture, () => rows(el) === before - 1, 'row gone from the list to review');
    // the other item, same screen with other parameters, shows the reviewed expenses
    clickLabel(el, 'lc-sidebar a.leaf', 'Reviewed');
    await until(fixture, () => url().endsWith('status=reviewed') && rows(el) > 0, 'reviewed expenses');
    expect(buttonsOf(el)).not.toContain('Reject');
  });

  it('the operator cannot open a screen without permission, not even by typing the URL', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    await TestBed.inject(Router).navigateByUrl('/expense-review/expense-list?status=to-review');
    await until(fixture, () => !!el.querySelector('main [role=alert]'), 'refusal');
    expect(el.querySelector('main')?.textContent).toContain('Non hai i permessi');
    expect(rows(el)).toBe(0);
  });

  it('a screen that does not exist shows an understandable message and goes to the technical reports', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    await TestBed.inject(Router).navigateByUrl('/invoice-lookup/missing-screen');
    await until(fixture, () => !!el.querySelector('main [role=alert]'), 'error');
    const text = el.querySelector('main [role=alert]')?.textContent ?? '';
    expect(text).toContain('La schermata richiesta non esiste o non è disponibile.');
    expect(text).not.toContain('404');
    expect(TestBed.inject(DemoDiagnostics).events()).toContainEqual({ screen: 'missing-screen', source: 'screen loading', error: 'HTTP 404' });
  });

  it('a menu that does not load shows a generic message and goes to the technical reports', async () => {
    delete files['examples/navigation.json'];
    try {
      const { fixture, el } = await start();
      await until(fixture, () => !!el.querySelector('[role=alert]'), 'error');
      expect(el.querySelector('[role=alert]')?.textContent).toContain('Non è stato possibile caricare il menu.');
      expect(TestBed.inject(DemoDiagnostics).events()).toContainEqual({ screen: 'navigation', source: 'navigation loading', error: 'HTTP 404' });
    } finally {
      files['examples/navigation.json'] = navigationDoc;
    }
  });

  it('the dark theme changes the CSS variables', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    await choose(fixture, headerSelect(el, 1), 'dark');
    await until(fixture, () => document.documentElement.style.getPropertyValue('--lc-color-primary') === '#6aa6ff', 'dark theme');
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
    // the bridge to NG-ZORRO sets its colours and loads the dark stylesheet
    await until(fixture, () => document.documentElement.style.getPropertyValue('--ant-primary-color') === '#6aa6ff', 'NG-ZORRO colours');
    expect(document.getElementById('lc-nz-dark-theme')?.getAttribute('href')).toBe('nz-dark.css');
    await choose(fixture, headerSelect(el, 1), 'light');
    await until(fixture, () => document.documentElement.style.getPropertyValue('--ant-primary-color') === '#1f5fbf', 'light theme');
    expect(document.getElementById('lc-nz-dark-theme')).toBeNull();
  });

  it('navigates to the detail of an order and shows the form with the protected fields', async () => {
    const { fixture, el } = await start();
    await until(fixture, () => rows(el) > 0, 'invoice list');
    await TestBed.inject(Router).navigateByUrl('/invoice-lookup/order-list');
    await until(fixture, () => rows(el) > 0, 'order list');
    clickLabel(el, 'main button', 'Open');
    await until(fixture, () => heading(el) === 'Order detail', 'detail');
    await until(fixture, () => (el.querySelector('main input[type=text]') as HTMLInputElement | null)?.value === 'Smith Ltd', 'form values');
    expect(el.querySelector('main')?.textContent).not.toContain('iban');
    expect((el.querySelector('main .actions button') as HTMLButtonElement).disabled).toBe(true);
  });
});
