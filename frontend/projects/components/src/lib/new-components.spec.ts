import { ApplicationRef, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { DialogConfirmation } from './dialog-confirmation';
import { NzModalService } from 'ng-zorro-antd/modal';
import { provideLowcodeComponents } from './provide';

const plain = (text: string | null | undefined): string => (text ?? '').replace(/[  \s]+/g, ' ').trim();

describe('new catalogue components', () => {
  const permissions = signal(new Set<string>());
  let requests: DataRequest[];
  let toasts: string[];
  let respond: (r: DataRequest) => unknown;

  async function render(
    components: NodeDefinition[],
    dataSources: ScreenDefinition['dataSources'] = {},
    granted: string[] = [],
  ): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    permissions.set(new Set(granted));
    requests = [];
    toasts = [];
    respond = () => ({});
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        { provide: DataClient, useValue: { request: async (r: DataRequest) => (requests.push(r), respond(r)) } },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'test', dataSources, components } satisfies ScreenDefinition);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function renderWithData(components: NodeDefinition[], data: unknown, granted: string[] = []) {
    permissions.set(new Set(granted));
    requests = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        { provide: DataClient, useValue: { request: async (r: DataRequest) => (requests.push(r), data) } },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', {
      schemaVersion: '1.0',
      screen: 'test',
      dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } },
      components,
    } satisfies ScreenDefinition);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  describe('table cell formats', () => {
    const row = { id: 1, amount: 12500, discount: 10, issued: '2026-10-07', paid: true, status: 'approved', other: 'sent', iban: 'IT60X0542811101000000123456' };
    const table: NodeDefinition = {
      type: 'table',
      source: 'data',
      columns: [
        { field: 'amount', label: 'Amount', format: 'currency' },
        { field: 'discount', label: 'Discount', format: 'percent' },
        { field: 'issued', label: 'Issued', format: 'date' },
        { field: 'paid', label: 'Paid', format: 'boolean' },
        { field: 'status', label: 'Status', format: 'badge', badges: { approved: 'success' } },
        { field: 'other', label: 'Other', format: 'badge', badges: { approved: 'success' } },
        { field: 'iban', label: 'IBAN', hiddenIf: "{{!can('orders.iban.read')}}" },
      ],
    };

    it('shows the formatted values', async () => {
      const { el } = await renderWithData([table], [row]);
      const cells = [...el.querySelectorAll('tbody td')].map((c) => plain(c.textContent));
      expect(cells.slice(0, 4)).toEqual(['12.500,00 €', '10 %', '07/10/26', 'Sì']);
      expect(cells.slice(4, 6)).toEqual(['approved', 'sent']);
    });

    it('badges take the tone of the theme; values not listed are neutral', async () => {
      const { el } = await renderWithData([table], [row]);
      const badges = [...el.querySelectorAll('tbody nz-tag')];
      expect(badges.map((b) => [...b.classList].find((c) => c.startsWith('ant-tag-') && c !== 'ant-tag'))).toEqual(['ant-tag-success', 'ant-tag-default']);
    });

    it('amounts and percentages are right-aligned', async () => {
      const { el } = await renderWithData([table], [row]);
      const aligned = [...el.querySelectorAll<HTMLElement>('thead th')].map((h) => h.style.textAlign === 'right');
      expect(aligned.slice(0, 5)).toEqual([true, true, false, false, false]);
    });

    it('a column with hiddenIf appears only to those with the permission, header included', async () => {
      const denied = await renderWithData([table], [row]);
      expect(denied.el.querySelectorAll('thead th')).toHaveLength(6);
      expect(denied.el.textContent).not.toContain('IT60X');
      TestBed.resetTestingModule();
      const allowed = await renderWithData([table], [row], ['orders.iban.read']);
      expect(allowed.el.querySelectorAll('thead th')).toHaveLength(7);
      expect(allowed.el.textContent).toContain('IT60X0542811101000000123456');
    });

    it('a text as a badge value is not interpreted as HTML', async () => {
      const { el } = await renderWithData([table], [{ ...row, status: '<img src=x onerror=alert(1)>' }]);
      expect(el.querySelector('tbody img')).toBeNull();
      expect(el.querySelector('tbody')?.textContent).toContain('<img');
    });
  });

  describe('detail', () => {
    const detail: NodeDefinition = {
      type: 'detail',
      source: 'data',
      title: 'Order',
      fields: [
        { field: 'number', label: 'Number' },
        { field: 'discount', label: 'Discount', format: 'percent' },
        { field: 'status', label: 'Status', format: 'badge', badges: { approved: 'success' } },
        { field: 'note', label: 'Note' },
        { field: 'iban', label: 'IBAN', hiddenIf: "{{!can('orders.iban.read')}}" },
      ],
    };
    const record = { number: 'ORD-1', discount: 10, status: 'approved', note: null, iban: 'IT60' };

    it('shows labels and formatted values; an empty value is a dash', async () => {
      const { el } = await renderWithData([detail], record);
      expect(plain(el.querySelector('.ant-card-head-title')?.textContent)).toBe('Order');
      const labels = [...el.querySelectorAll('.ant-descriptions-item-label')].map((d) => plain(d.textContent));
      const values = [...el.querySelectorAll('.ant-descriptions-item-content')].map((d) => plain(d.textContent));
      expect(labels).toEqual(['Number', 'Discount', 'Status', 'Note']);
      expect(values).toEqual(['ORD-1', '10 %', 'approved', '—']);
      expect(el.querySelector('.ant-descriptions-item-content nz-tag.ant-tag-success')).not.toBeNull();
    });

    it('fields with hiddenIf appear only with the permission', async () => {
      const { el } = await renderWithData([detail], record, ['orders.iban.read']);
      expect(el.textContent).toContain('IBAN');
    });

    it('before the data it shows the loading state; if the response is not a record, "Nessun dato"', async () => {
      const { el } = await renderWithData([detail], [1, 2]);
      expect(plain(el.textContent)).toContain('Nessun dato.');
    });

    it('if the service fails it shows an error readable by screen reader users', async () => {
      permissions.set(new Set());
      TestBed.configureTestingModule({
        providers: [
          provideLowcodeComponents(),
          { provide: Authorization, useValue: { can: () => true } },
          { provide: UserProvider, useValue: { user: () => ({}) } },
          { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
          { provide: Notifier, useValue: { toast: () => undefined } },
          { provide: DataClient, useValue: { request: async () => { throw new Error('500'); } } },
        ],
      });
      const fixture = TestBed.createComponent(ScreenComponent);
      fixture.componentRef.setInput('definition', { schemaVersion: '1.0', screen: 'p', dataSources: { data: { type: 'rest', method: 'GET', url: '/api/data' } }, components: [detail] });
      await settle(fixture);
      expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    });
  });

  describe('alert', () => {
    it('uses the right role for the kind and interpolates the values', async () => {
      const { el } = await render([
        { type: 'alert', text: 'Hello {{user.username}}' },
        { type: 'alert', text: 'Saved', kind: 'success' },
        { type: 'alert', text: 'Error', kind: 'error' },
      ]);
      const alerts = [...el.querySelectorAll('lc-alert > div')];
      const kind = (a: Element): string | undefined => [...(a.querySelector('.ant-alert')?.classList ?? [])].find((c) => /^ant-alert-(info|success|error)$/.test(c));
      expect(alerts.map((a) => [a.getAttribute('role'), kind(a)])).toEqual([
        ['status', 'ant-alert-info'],
        ['status', 'ant-alert-success'],
        ['alert', 'ant-alert-error'],
      ]);
      expect(plain(alerts[0].textContent)).toBe('Hello u');
    });

    it('appears and disappears with visibleIf, which depends on permissions', async () => {
      const { fixture, el } = await render([{ type: 'alert', text: 'Read only', visibleIf: "{{!can('orders.order.write')}}" }]);
      expect(el.querySelector('lc-alert')).not.toBeNull();
      permissions.set(new Set(['orders.order.write']));
      await settle(fixture);
      expect(el.querySelector('lc-alert')).toBeNull();
    });
  });

  describe('tabs', () => {
    const tabs: NodeDefinition = {
      type: 'tabs',
      tabs: [
        { label: 'Data', components: [{ type: 'form', fields: [{ name: 'customer', type: 'text', label: 'Customer' }] }] },
        { label: 'Note', components: [{ type: 'text', text: 'Text of the notes' }] },
        { label: 'Bank', visibleIf: "{{can('orders.iban.read')}}", components: [{ type: 'text', text: 'Bank details' }] },
      ],
    };
    const tabButtons = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('[role=tab]')];
    const panels = (el: HTMLElement): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('[role=tabpanel]')];
    const selected = (el: HTMLElement): (string | null)[] => tabButtons(el).map((b) => b.getAttribute('aria-selected'));

    it('shows the first tab and links the tabs to their panels', async () => {
      const { el } = await render([tabs]);
      expect(tabButtons(el).map((b) => plain(b.textContent))).toEqual(['Data', 'Note']);
      expect(selected(el)).toEqual(['true', 'false']);
      // All panels stay in the page; the ones not chosen are hidden from screen reader users.
      expect(panels(el).map((p) => p.getAttribute('aria-hidden'))).toEqual(['false', 'true']);
      expect(panels(el)[0].getAttribute('aria-labelledby')).toBe(tabButtons(el)[0].id);
    });

    it('a click changes tab and only the chosen tab is in the tab order', async () => {
      const { fixture, el } = await render([tabs]);
      tabButtons(el)[1].click();
      await settle(fixture);
      expect(selected(el)).toEqual(['false', 'true']);
      expect(panels(el).map((p) => p.getAttribute('aria-hidden'))).toEqual(['true', 'false']);
      expect(tabButtons(el).map((b) => b.tabIndex)).toEqual([-1, 0]);
    });

    it('data written in a tab is not lost when changing tab', async () => {
      const { fixture, el } = await render([tabs]);
      const input = el.querySelector('input') as HTMLInputElement;
      input.value = 'Acme Ltd';
      input.dispatchEvent(new Event('input'));
      await settle(fixture);
      tabButtons(el)[1].click();
      await settle(fixture);
      tabButtons(el)[0].click();
      await settle(fixture);
      expect((el.querySelector('input') as HTMLInputElement).value).toBe('Acme Ltd');
    });

    it('a tab with visibleIf appears with the permission; if it disappears, the first one is selected again', async () => {
      const { fixture, el } = await render([tabs], {}, ['orders.iban.read']);
      expect(tabButtons(el).map((b) => plain(b.textContent))).toEqual(['Data', 'Note', 'Bank']);
      tabButtons(el)[2].click();
      await settle(fixture);
      expect(selected(el)).toEqual(['false', 'false', 'true']);
      permissions.set(new Set());
      await settle(fixture);
      expect(tabButtons(el)).toHaveLength(2);
      expect(selected(el)[0]).toBe('true');
    });
  });

  describe('confirmation dialog', () => {
    // A dialog just closed stays in the document until the end of its animation: the last one counts.
    const dialog = (): HTMLElement | null => [...document.body.querySelectorAll<HTMLElement>('.ant-modal-confirm')].at(-1) ?? null;
    const button = (action: 'cancel' | 'confirm'): HTMLButtonElement => {
      const all = [...document.body.querySelectorAll<HTMLElement>('.ant-modal-confirm-btns')].at(-1)!.querySelectorAll<HTMLButtonElement>('button');
      return action === 'cancel' ? all[0] : all[1];
    };
    const click = (action: 'cancel' | 'confirm'): void => button(action).click();
    /** The dialog appears after a change-detection cycle and its animation. */
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 4; i++) {
        TestBed.inject(ApplicationRef).tick();
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    const ask = (message: string): Promise<boolean> => TestBed.inject(DialogConfirmation).confirm(message);

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideLowcodeComponents()] }));
    afterEach(() => {
      document.body.querySelectorAll('.cdk-overlay-container, .stub').forEach((n) => n.remove());
    });

    it('shows the message as text, with the focus on Cancel, and Confirm resolves true', async () => {
      const result = ask('Approve <b>ORD-1</b>?');
      await flush();
      expect(document.body.querySelector('[role=dialog]')).not.toBeNull();
      expect(dialog()?.querySelector('b')).toBeNull();
      expect(dialog()?.textContent).toContain('Approve <b>ORD-1</b>?');
      expect(plain(button('confirm').textContent)).toBe('Conferma');
      click('confirm');
      expect(await result).toBe(true);
    });

    it('the focus starts on Cancel (focus cannot be tested in jsdom: the configuration is checked)', async () => {
      const spy = vi.spyOn(TestBed.inject(NzModalService), 'confirm');
      const result = ask('Sure?');
      await flush();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ nzAutofocus: 'cancel', nzKeyboard: true, nzMaskClosable: true }));
      click('cancel');
      await result;
    });

    it('Cancel, Esc and a click on the backdrop resolve false', async () => {
      let result = ask('Sure?');
      await flush();
      click('cancel');
      expect(await result).toBe(false);
      await flush();
      result = ask('Sure?');
      await flush();
      (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await flush();
      expect(await result).toBe(false);
      await flush();
      result = ask('Sure?');
      await flush();
      ([...document.body.querySelectorAll<HTMLElement>('.ant-modal-wrap')].at(-1) as HTMLElement).click();
      await flush();
      expect(await result).toBe(false);
    });

    it('a click inside the dialog, outside the buttons, does not cancel', async () => {
      const result = ask('Sure?');
      await flush();
      (dialog()?.querySelector('.ant-modal-confirm-content') as HTMLElement).click();
      await flush();
      expect(dialog()).not.toBeNull();
      click('cancel');
      await result;
    });

    it('a second request while the dialog is open is rejected', async () => {
      const first = ask('First');
      await flush();
      expect(await TestBed.inject(DialogConfirmation).confirm('Second')).toBe(false);
      expect(document.body.querySelectorAll('.ant-modal-confirm-btns')).toHaveLength(1);
      click('confirm');
      expect(await first).toBe(true);
    });

    it('on closing, the focus goes back where it was', async () => {
      const opener = document.createElement('button');
      opener.className = 'stub';
      document.body.appendChild(opener);
      opener.focus();
      const result = ask('Sure?');
      await flush();
      expect(document.activeElement).not.toBe(opener);
      click('cancel');
      await result;
      expect(document.activeElement).toBe(opener);
    });

    it('in a screen, a button with confirm does not call the service when cancelled and calls it when confirmed', async () => {
      const buttonNode: NodeDefinition = {
        type: 'button',
        label: 'Delete',
        onClick: [{ confirm: 'Delete {{user.username}}?' }, { call: 'delete' }, { toast: 'Deleted' }],
      };
      const { fixture, el } = await render([buttonNode], { delete: { type: 'rest', method: 'POST', url: '/api/delete' } });
      const press = async (): Promise<void> => {
        (el.querySelector('lc-button button') as HTMLButtonElement).click();
        await flush();
        await settle(fixture);
      };
      await press();
      expect(dialog()?.textContent).toContain('Delete u?');
      click('cancel');
      await flush();
      await settle(fixture);
      expect(requests).toEqual([]);
      expect(toasts).toEqual([]);
      await press();
      click('confirm');
      for (let i = 0; i < 20 && toasts.length === 0; i++) await new Promise((r) => setTimeout(r));
      expect(requests.map((r) => r.url)).toEqual(['/api/delete']);
      expect(toasts).toEqual(['Deleted']);
    });
  });
});
