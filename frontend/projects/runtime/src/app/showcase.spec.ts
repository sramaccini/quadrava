import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router } from '@angular/router';
import navigationDoc from '../../public/examples/navigation.json';
import invoices from '../../public/examples/screens/invoice-list.json';
import base from '../../public/examples/screens/showcase-basics.json';
import form from '../../public/examples/screens/showcase-form.json';
import tables from '../../public/examples/screens/showcase-tables.json';
import layout from '../../public/examples/screens/showcase-layout.json';
import detail from '../../public/examples/screens/order-detail.json';
import light from '../../public/examples/themes/light.json';
import dark from '../../public/examples/themes/dark.json';
import { DemoDiagnostics } from '../demo/demo-ports';
import { openSelect, stubViewportHeight } from './select-testing';
import catalogIt from '../../public/examples/i18n/it.json';
import catalogEn from '../../public/examples/i18n/en.json';
import { I18n } from 'core';
import { App } from './app';
import { appConfig } from './app.config';
import { SHOWCASE_FILES } from './showcase-testing';

/** The showcase must really work: every screen opens without errors and its examples do what they say. */
describe('Component showcase', () => {
  const files: Record<string, unknown> = {
    'examples/navigation.json': navigationDoc,
    // The data sources documents the screens refer to.
    ...Object.fromEntries(Object.entries(SHOWCASE_FILES).filter(([url]) => url.startsWith('examples/datasources/'))),
    // The initial destination, which opens before going to the showcase screen.
    'examples/screens/invoice-list.json': invoices,
    'examples/screens/showcase-basics.json': base,
    'examples/screens/showcase-form.json': form,
    'examples/screens/showcase-tables.json': tables,
    'examples/screens/showcase-layout.json': layout,
    'examples/screens/order-detail.json': detail,
    'examples/i18n/it.json': catalogIt,
    'examples/i18n/en.json': catalogEn,
    'examples/themes/light.json': light,
    'examples/themes/dark.json': dark,
  };

  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());

  beforeEach(() => {
    // Demo language fixed, whatever the browser declares.
    localStorage.setItem('lc.language', 'en');
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
  });

  async function until(fixture: ComponentFixture<App>, condition: () => boolean, label: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      if (condition()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout: ${label}\n${(fixture.nativeElement as HTMLElement).querySelector('main')?.innerHTML.slice(0, 1500)}`);
  }

  async function open(path: string, user = 'operator'): Promise<{ fixture: ComponentFixture<App>; el: HTMLElement }> {
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/');
    await until(fixture, () => !!el.querySelector('nz-header nz-select'), 'top bar');
    if (user !== 'operator') await pick(fixture, el.querySelector('nz-header nz-select') as HTMLElement, user);
    await TestBed.inject(Router).navigateByUrl(path);
    await until(fixture, () => !!el.querySelector('main h2'), 'content');
    return { fixture, el };
  }

  /** Chooses an item of an NG-ZORRO drop-down from its text. */
  async function pick(fixture: ComponentFixture<App>, select: HTMLElement, label: string): Promise<void> {
    const options = await openSelect(select, async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    });
    (options.find((o) => (o.textContent ?? '').trim() === label) as HTMLElement).click();
  }
  const toast = (): Element | null => document.body.querySelector('.ant-message-notice');
  const main = (el: HTMLElement): string => el.querySelector('main')?.textContent ?? '';
  const button = (el: HTMLElement, text: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('main button')].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement | undefined;
  const rows = (el: HTMLElement, table = 0): number => el.querySelectorAll('main nz-table')[table]?.querySelectorAll('tbody tr:not(.ant-table-placeholder)').length ?? 0;
  const plain = (text: string | null | undefined): string => (text ?? '').replace(/[\u00a0\u202f\s]+/g, ' ').trim();
  // A dialog just closed stays in the document until the end of the animation: the last one counts.
  const dialog = (): HTMLElement | null => [...document.body.querySelectorAll<HTMLElement>('.ant-modal-confirm')].at(-1) ?? null;
  const answer = (action: 'confirm' | 'cancel'): void => {
    const buttons = [...document.body.querySelectorAll<HTMLElement>('.ant-modal-confirm-btns')].at(-1)!.querySelectorAll<HTMLButtonElement>('button');
    (action === 'cancel' ? buttons[0] : buttons[1]).click();
  };
  const field = (el: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement | null =>
    [...el.querySelectorAll('main input, main select')].find((i) => i.id.endsWith(`-${name}`)) as HTMLInputElement | undefined ?? null;
  const type = async (fixture: ComponentFixture<App>, el: HTMLElement, name: string, value: string): Promise<void> => {
    const f = field(el, name)!;
    const select = f.closest('nz-select') as HTMLElement | null;
    if (select) return pick(fixture, select, value);
    f.value = value;
    f.dispatchEvent(new Event('input'));
  };

  it('the area appears in the menu and the screens open without errors', async () => {
    const diagnostics = TestBed.inject(DemoDiagnostics);
    for (const [path, titolo] of [
      ['/showcase/showcase-basics', 'Basic components'],
      ['/showcase/showcase-form', 'Forms'],
      ['/showcase/showcase-tables', 'Filters and tables'],
      ['/showcase/showcase-layout', 'Tabs, detail and messages'],
    ]) {
      const { el, fixture } = await open(path);
      await until(fixture, () => main(el).includes(titolo), titolo);
      expect(el.querySelector('lc-sidebar')?.textContent).toContain('Basic components');
      fixture.destroy();
    }
    expect(diagnostics.events(), JSON.stringify(diagnostics.events())).toEqual([]);
  });

  describe('basic components', () => {
    it('the counter changes the text and enables the button conditioned by the state', async () => {
      const { fixture, el } = await open('/showcase/showcase-basics');
      expect(main(el)).toContain('You pressed the button 0 times');
      expect(button(el, 'Enabled after')!.disabled).toBe(true);
      button(el, 'Increment')!.click();
      await until(fixture, () => main(el).includes('1 times'), 'first increment');
      await new Promise((r) => setTimeout(r, 30)); // the button stays busy until the action ends
      button(el, 'Increment')!.click();
      await until(fixture, () => main(el).includes('2 times'), 'second increment');
      expect(button(el, 'Enabled after')!.disabled).toBe(false);
    });

    it('the failing call shows only the onError message and stops the sequence', async () => {
      const { fixture, el } = await open('/showcase/showcase-basics');
      button(el, 'Failing call')!.click();
      await until(fixture, () => !!toast(), 'toast');
      expect(toast()?.textContent).toContain('Error handled');
      await new Promise((r) => setTimeout(r, 300));
      expect(el.textContent).not.toContain('non compare mai');
    });

    it('visibility follows the permissions of the profile', async () => {
      const { el } = await open('/showcase/showcase-basics');
      expect(button(el, 'Visibile solo con il permesso')).toBeUndefined();
      expect(button(el, 'Hidden from those who can read')).toBeDefined();
      const admin = await open('/showcase/showcase-basics', 'administrator');
      expect(button(admin.el, 'Visible only with the permission')).toBeDefined();
      expect(button(admin.el, 'Nascosto a chi può leggere')).toBeUndefined();
    });
  });

  describe('form', () => {
    it('required fields and rules show their errors only after submitting', async () => {
      const { fixture, el } = await open('/showcase/showcase-form');
      expect(el.querySelectorAll('main .ant-form-item-explain-error').length).toBe(0);
      button(el, 'Submit')!.click();
      await until(fixture, () => el.querySelectorAll('main .ant-form-item-explain-error').length > 0, 'name error');
      await type(fixture, el, 'name', 'Mario');
      await type(fixture, el, 'age', '12');
      button(el, 'Submit')!.click();
      await until(fixture, () => main(el).includes("Age must be between 18 and 120"), 'age rule');
      await type(fixture, el, 'age', '40');
      button(el, 'Submit')!.click();
      await until(fixture, () => !!toast(), 'sent successfully');
      expect(toast()?.textContent).toContain('Data submitted');
    });

    it('the VAT number field appears only for business customers and becomes required', async () => {
      const { fixture, el } = await open('/showcase/showcase-form');
      expect(field(el, 'vatNumber')).toBeNull();
      await type(fixture, el, 'category', 'Business');
      await until(fixture, () => !!field(el, 'vatNumber'), 'conditional field');
      await type(fixture, el, 'name', 'Mario');
      button(el, 'Submit')!.click();
      await until(fixture, () => main(el).includes('Required field'), 'VAT number required');
      await type(fixture, el, 'vatNumber', '123');
      button(el, 'Submit')!.click();
      await until(fixture, () => main(el).includes('The VAT number has 11 digits'), 'VAT number rule');
    });

    it('the edit form loads the data and protects IBAN and saving according to the permissions', async () => {
      const operator = await open('/showcase/showcase-form');
      await until(operator.fixture, () => (field(operator.el, 'customer') as HTMLInputElement | null)?.value === 'Smith Ltd', 'data loaded');
      expect(field(operator.el, 'iban')).toBeNull();
      expect(button(operator.el, 'Save')!.disabled).toBe(true);
      operator.fixture.destroy();
      const admin = await open('/showcase/showcase-form', 'administrator');
      await until(admin.fixture, () => (field(admin.el, 'customer') as HTMLInputElement | null)?.value === 'Smith Ltd', 'data loaded');
      expect(field(admin.el, 'iban')).not.toBeNull();
      await until(admin.fixture, () => button(admin.el, 'Save')!.disabled === false, 'saving enabled');
    });
  });

  describe('filters and tables', () => {
    it('the filter reloads the table and paging moves through the pages', async () => {
      const { fixture, el } = await open('/showcase/showcase-tables');
      await until(fixture, () => rows(el, 0) === 8, 'first page');
      (el.querySelector('main .ant-pagination-next button') as HTMLButtonElement).click();
      await until(fixture, () => el.querySelector('main .ant-pagination-item-active')?.textContent?.trim() === '2' && rows(el, 0) === 8, 'second page');
      await type(fixture, el, 'status', 'Approved');
      // Filtered rows fit in a single page: back to the first one and the pages disappear.
      await until(fixture, () => rows(el, 0) === 7 && !el.querySelector('main lc-table-footer .ant-pagination'), 'filter applied');
    });

    it('row actions respect permissions and row status', async () => {
      const operator = await open('/showcase/showcase-tables');
      await until(operator.fixture, () => rows(operator.el, 0) > 0, 'rows');
      expect(button(operator.el, 'Approve')).toBeUndefined();
      operator.fixture.destroy();
      const manager = await open('/showcase/showcase-tables', 'manager');
      await until(manager.fixture, () => rows(manager.el, 0) > 0, 'rows');
      const approve = [...manager.el.querySelectorAll('main button')].filter((b) => b.textContent?.trim() === 'Approve');
      expect(approve.length).toBeGreaterThan(0);
      expect(approve.length).toBeLessThan(8); // only "submitted" orders
      const before = approve.length;
      (approve[0] as HTMLButtonElement).click();
      // Approval asks for confirmation: cancelling changes nothing.
      await until(manager.fixture, () => !!dialog(), 'confirmation dialog');
      expect(dialog()?.textContent).toMatch(/Approve order ORD-\d{4}\?/);
      answer('cancel');
      await new Promise((r) => setTimeout(r, 300));
      expect(toast()).toBeNull();
      expect([...manager.el.querySelectorAll('main button')].filter((b) => b.textContent?.trim() === 'Approve').length).toBe(before);
      (approve[0] as HTMLButtonElement).click();
      await until(manager.fixture, () => !!dialog(), 'second confirmation dialog');
      answer('confirm');
      await until(manager.fixture, () => !!toast(), 'confirmation');
      await until(manager.fixture, () => [...manager.el.querySelectorAll('main button')].filter((b) => b.textContent?.trim() === 'Approve').length === before - 1, 'row updated');
    });

    it('the simple table shows an array of rows', async () => {
      const { fixture, el } = await open('/showcase/showcase-tables');
      await until(fixture, () => rows(el, 1) === 2, 'packages');
      expect(main(el)).toContain('September closing');
    });
    it('cell formats: percentage and badge of the orders, amount, date and yes/no of the invoices', async () => {
      const { fixture, el } = await open('/showcase/showcase-tables');
      await until(fixture, () => rows(el, 0) > 0 && rows(el, 2) > 0, 'rows');
      const first = [...el.querySelectorAll('main nz-table')[0].querySelectorAll('tbody tr')[0].querySelectorAll('td')].map((c) => plain(c.textContent));
      expect(first[3]).toBe('0 %');
      expect(el.querySelector('main nz-table tbody tr nz-tag')?.className).toContain('ant-tag-');
      const invoice = [...el.querySelectorAll('main nz-table')[2].querySelectorAll('tbody tr')[0].querySelectorAll('td')].map((c) => plain(c.textContent));
      expect(invoice[2]).toMatch(/^€[\d,]+\.00$/);
      expect(invoice[3]).toMatch(/^\d{2}\/09\/2026$/);
      expect(invoice[4]).toBe('No');
      expect(invoice[5]).toBe('Sent');
    });
  });

  describe('tabs, detail and messages', () => {
    const tabs = (el: HTMLElement): string[] => [...el.querySelectorAll('main [role=tab]')].map((t) => plain(t.textContent));
    const openTab = async (fixture: ComponentFixture<App>, el: HTMLElement, label: string): Promise<void> => {
      ([...el.querySelectorAll('main [role=tab]')].find((t) => plain(t.textContent) === label) as HTMLElement).click();
      await until(fixture, () => !(el.querySelector('main [role=tabpanel][aria-hidden=false]') === null), label);
    };

    it('the operator sees the order detail, the read-only message and three tabs', async () => {
      const { fixture, el } = await open('/showcase/showcase-layout');
      await until(fixture, () => main(el).includes('ORD-0001'), 'detail');
      expect(tabs(el)).toEqual(["Order data", 'Paid invoices', 'Actions with confirmation']);
      expect(el.querySelector('main lc-alert .ant-alert-error')?.textContent).toContain('cannot edit');
      const pairs = [...el.querySelectorAll('main .ant-descriptions-item-label')].map((l) => plain(`${l.textContent} ${l.nextElementSibling?.textContent}`));
      expect(pairs).toContain('Discount 0 %');
      expect(main(el)).not.toContain('IBAN');
    });

    it('the manager no longer sees the message; the administrator also has the IBAN and the restricted tab', async () => {
      const manager = await open('/showcase/showcase-layout', 'manager');
      await until(manager.fixture, () => main(manager.el).includes('ORD-0001'), 'detail');
      expect(manager.el.querySelector('main lc-alert .ant-alert-error')).toBeNull();
      manager.fixture.destroy();
      const admin = await open('/showcase/showcase-layout', 'administrator');
      await until(admin.fixture, () => main(admin.el).includes('ORD-0001'), 'detail');
      expect(tabs(admin.el)).toEqual(["Order data", 'Paid invoices', 'Actions with confirmation', 'Restricted data']);
      expect(main(admin.el)).toContain('IBAN');
      expect(main(admin.el)).toContain('IT60X0542811101');
    });

    it('the invoices tab shows amount, date and yes/no formatted', async () => {
      const { fixture, el } = await open('/showcase/showcase-layout');
      await openTab(fixture, el, 'Paid invoices');
      await until(fixture, () => rows(el, 0) > 0, 'paid invoices');
      const cells = [...el.querySelectorAll('main nz-table tbody tr')[0].querySelectorAll('td')].map((c) => plain(c.textContent));
      expect(cells[1]).toMatch(/\.00$/);
      expect(cells[2]).toMatch(/^\d{2}\/09\/2026$/);
      expect(cells[3]).toBe('Yes');
    });

    it('the action with confirmation: Cancel does nothing, Confirm runs and notifies', async () => {
      const { fixture, el } = await open('/showcase/showcase-layout');
      await openTab(fixture, el, 'Actions with confirmation');
      button(el, 'Delete the draft')!.click();
      await until(fixture, () => !!dialog(), 'dialog');
      expect(dialog()?.textContent).toContain('draft of operator');
      answer('cancel');
      await new Promise((r) => setTimeout(r, 300));
      expect(toast()).toBeNull();
      button(el, 'Delete the draft')!.click();
      await until(fixture, () => !!dialog(), 'second dialog');
      answer('confirm');
      await until(fixture, () => !!toast(), 'confirmation');
      expect(toast()?.textContent).toContain('Draft deleted');
    });
  });

  it('changing language changes title, menu, screen texts and shell labels', async () => {
    const { fixture, el } = await open('/invoice-entry/showcase-basics');
    await until(fixture, () => !!el.querySelector('h1') && el.querySelector('h1')!.textContent!.includes('Showcase: basic components'), 'title in Italian');
    expect(el.querySelector('lc-sidebar')!.textContent).toContain('Invoice entry');
    TestBed.inject(I18n).setLocale('en');
    await until(fixture, () => el.querySelector('h1')!.textContent!.includes('Showcase: basic components'), 'title in English');
    expect(el.querySelector('lc-sidebar')!.textContent).toContain('Invoice entry');
    expect(el.textContent).toContain('Active language: en');
    expect(el.textContent).toContain('Language');
    expect(document.documentElement.lang).toBe('en');
  });
});
