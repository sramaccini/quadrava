import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Authorization, DataClient, Notifier, ScreenComponent, ScreenNavigator, UserProvider, type DataRequest } from 'core';
import type { ScreenDefinition } from 'schema';
import { provideLowcodeComponents } from './provide';
import { openSelect, stubViewportHeight } from './select-testing';

const screen: ScreenDefinition = {
  schemaVersion: '1.0',
  screen: 'order-list',
  title: 'Orders',
  requires: 'orders.order.read',
  dataSources: {
    orders: { type: 'rest', method: 'GET', url: '/api/orders', params: { status: '{{state.filters.status}}', page: '{{state.page}}' }, paging: 'server' },
    approveOrder: { type: 'rest', method: 'POST', url: '/api/orders/{{id}}/approve' },
  },
  components: [
    { type: 'filterBar', bind: 'state.filters', fields: [{ name: 'status', type: 'select', label: 'Status', options: ['draft', 'sent'] }] },
    {
      type: 'table',
      source: 'orders',
      columns: [{ field: 'number' }, { field: 'status' }],
      rowActions: [
        {
          label: 'Approve',
          visibleIf: "{{can('orders.order.approve') && row.status == 'sent'}}",
          onClick: [
            { call: 'approveOrder', args: { id: '{{row.id}}' }, onError: { toast: 'Approval failed' } },
            { refresh: 'orders' },
            { toast: 'Order {{row.number}} approved' },
          ],
        },
      ],
    },
  ],
};

const rows = [
  { id: 1, number: 'A-1', status: 'draft' },
  { id: 2, number: 'A-2', status: 'sent' },
];

describe('ScreenComponent + standard catalogue', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());

  // Like the real Authorization implementation, permissions are a signal: a change redraws the screen.
  const permissions = signal(new Set<string>());
  const grant = (p: string): void => permissions.update((s) => new Set(s).add(p));
  let requests: DataRequest[];
  let toasts: string[];

  async function render(): Promise<{ fixture: ComponentFixture<ScreenComponent>; el: HTMLElement }> {
    permissions.set(new Set(['orders.order.read']));
    requests = [];
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        provideLowcodeComponents(),
        { provide: Authorization, useValue: { can: (p: string) => permissions().has(p) } },
        { provide: UserProvider, useValue: { user: () => ({ username: 'u' }) } },
        { provide: ScreenNavigator, useValue: { navigate: () => undefined } },
        { provide: Notifier, useValue: { toast: (m: string) => toasts.push(m) } },
        {
          provide: DataClient,
          useValue: {
            request: async (r: DataRequest) => {
              requests.push(r);
              return r.method === 'GET' ? { items: rows, total: 2, size: 10 } : {};
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ScreenComponent);
    fixture.componentRef.setInput('definition', screen);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');

  it('shows the title and the loaded rows', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Orders');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(requests[0]).toEqual({ method: 'GET', url: '/api/orders', query: { page: 0 } });
  });

  it('the page header shows breadcrumbs, title and description', async () => {
    const { fixture, el } = await render();
    expect(el.querySelector('nz-breadcrumb')).toBeNull();
    fixture.componentRef.setInput('breadcrumb', ['Browse', 'Orders']);
    fixture.componentRef.setInput('definition', { ...screen, description: 'List of orders.' });
    await settle(fixture);
    const crumbs = [...el.querySelectorAll('nz-breadcrumb-item')].map((n) => (n.textContent ?? '').replace('/', '').trim());
    expect(crumbs).toEqual(['Browse', 'Orders']);
    expect(el.querySelector('header.page-header h1')?.textContent?.trim()).toBe('Orders');
    expect(el.querySelector('header.page-header .description')?.textContent?.trim()).toBe('List of orders.');
  });

  it('without the approval permission it does not show the button', async () => {
    const { el } = await render();
    expect(buttons(el)).not.toContain('Approve');
  });

  it('with the permission it shows Approve only on sent rows', async () => {
    const { fixture, el } = await render();
    grant('orders.order.approve');
    await settle(fixture);
    expect(buttons(el).filter((b) => b === 'Approve')).toHaveLength(1);
    expect(el.querySelectorAll('tbody tr')[1]?.textContent).toContain('Approve');
  });

  it('the click runs the call, reloads the table and notifies', async () => {
    const { fixture, el } = await render();
    grant('orders.order.approve');
    await settle(fixture);
    const approve = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Approve') as HTMLButtonElement;
    approve.click();
    // The steps are asynchronous: wait for the end of the sequence (the last one is the message).
    for (let i = 0; i < 20 && toasts.length === 0; i++) await new Promise((r) => setTimeout(r));
    await settle(fixture);
    expect(requests.some((r) => r.method === 'POST' && r.url === '/api/orders/2/approve')).toBe(true);
    expect(requests.filter((r) => r.method === 'GET').length).toBeGreaterThanOrEqual(2);
    expect(toasts).toEqual(['Order A-2 approved']);
  });

  it('changing a filter reloads with the parameter', async () => {
    const { fixture, el } = await render();
    const options = await openSelect(el.querySelector('lc-filter-bar nz-select') as Element, () => settle(fixture));
    (options.find((o) => o.textContent?.trim() === 'sent') as HTMLElement).click();
    await settle(fixture);
    expect(requests.at(-1)?.query).toEqual({ status: 'sent', page: 0 });
  });

  it('without the screen permission it shows the refusal and does not call the back end', async () => {
    const { fixture, el } = await render();
    permissions.set(new Set());
    requests.length = 0;
    await settle(fixture);
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Non hai i permessi');
    expect(requests).toHaveLength(0);
  });
});
