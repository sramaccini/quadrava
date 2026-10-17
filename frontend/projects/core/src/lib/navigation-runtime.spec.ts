import { signal } from '@angular/core';
import { ExpressionEngine } from 'expressions';
import type { NavigationDefinition } from 'schema';
import { checkNavigation } from './navigation-check';
import { NavigationRuntime } from './navigation-runtime';
import { I18n } from './i18n';
import type { Authorization, UserProvider } from './ports';

const definition: NavigationDefinition = {
  schemaVersion: '1.0',
  navigation: 'app',
  default: 'lookup',
  areas: [
    {
      id: 'entry',
      label: 'Entry',
      requires: 'invoices.invoice.create',
      items: [
        {
          id: 'new',
          label: 'New',
          children: [
            { id: 'sales', label: 'Sales', screen: 'invoice-new', params: { type: 'sales' } },
            { id: 'purchase', label: 'Purchase', screen: 'invoice-new', params: { type: 'purchase' } },
            { id: 'from-order', label: 'From order', children: [{ id: 'choose', label: 'Choose', screen: 'order-list', requires: 'orders.order.read' }] },
          ],
        },
      ],
    },
    {
      id: 'lookup',
      label: 'Lookup',
      requires: 'invoices.invoice.read',
      items: [
        { id: 'list', label: 'List', screen: 'invoice-list' },
        { id: 'admin-only', label: 'Admin only', screen: 'x', visibleIf: "{{'administrator' in user.roles}}" },
        { id: 'broken', label: 'Broken', screen: 'y', visibleIf: '{{user.missing == 1}}' },
      ],
    },
  ],
};

function setup(initial: string[], roles: string[] = []) {
  const permissions = signal(new Set(initial));
  const reports: string[] = [];
  const authorization = { can: (p: string) => permissions().has(p) } as Authorization;
  const userProvider = { user: () => ({ roles }) } as UserProvider;
  const nav = new NavigationRuntime(definition, { authorization, userProvider, diagnostics: { report: (e) => reports.push(e.source) } });
  return { nav, permissions, reports };
}

describe('NavigationRuntime', () => {
  it('shows only the allowed areas', () => {
    const { nav } = setup(['invoices.invoice.read']);
    expect(nav.areas().map((u) => u.id)).toEqual(['lookup']);
  });

  it('hides an area if no item is visible', () => {
    const { nav } = setup(['invoices.invoice.create']);
    // The "Sales" and "Purchase" items require no permissions of their own: the area stays.
    expect(nav.areas().map((u) => u.id)).toEqual(['entry']);
    expect(nav.area('entry')?.items).toHaveLength(1);
  });

  it('drops empty groups and keeps the three levels when allowed', () => {
    const { nav } = setup(['invoices.invoice.create']);
    const newInvoice = nav.area('entry')?.items[0];
    expect(newInvoice?.kind === 'group' && newInvoice.children.map((c) => c.id)).toEqual(['sales', 'purchase']);
    const withOrders = setup(['invoices.invoice.create', 'orders.order.read']).nav.area('entry')?.items[0];
    expect(withOrders?.kind === 'group' && withOrders.children.map((c) => c.id)).toEqual(['sales', 'purchase', 'from-order']);
  });

  it('updates when the permissions change', () => {
    const { nav, permissions } = setup([]);
    expect(nav.areas()).toEqual([]);
    permissions.set(new Set(['invoices.invoice.read']));
    expect(nav.areas().map((u) => u.id)).toEqual(['lookup']);
  });

  it('visibleIf: true shows, an error hides and reports', async () => {
    const { nav, reports } = setup(['invoices.invoice.read'], ['administrator']);
    const ids = nav.area('lookup')?.items.map((i) => i.id);
    expect(ids).toEqual(['list', 'admin-only']);
    await Promise.resolve();
    expect(reports.length).toBeGreaterThan(0);
    expect(setup(['invoices.invoice.read'], ['operator']).nav.area('lookup')?.items.map((i) => i.id)).toEqual(['list']);
  });

  it('chooses the initial destination: default if visible, otherwise the first area', () => {
    expect(setup(['invoices.invoice.read', 'invoices.invoice.create']).nav.defaultTarget()).toMatchObject({ area: 'lookup', leaf: { id: 'list' } });
    expect(setup(['invoices.invoice.create']).nav.defaultTarget()).toMatchObject({ area: 'entry', leaf: { id: 'sales' } });
    expect(setup([]).nav.defaultTarget()).toBeNull();
  });

  it('builds the path of labels for the breadcrumb', () => {
    const { nav } = setup(['invoices.invoice.create']);
    expect(nav.trail('entry', 'invoice-new', { type: 'purchase' })).toEqual(['Entry', 'New', 'Purchase']);
    expect(nav.trail('entry', 'invoice-new', { type: 'other' })).toBeNull();
  });

  it('finds the active item using screen and parameters', () => {
    const { nav } = setup(['invoices.invoice.create']);
    expect(nav.locate('entry', 'invoice-new', { type: 'purchase' })).toEqual(['new', 'purchase']);
    expect(nav.locate('entry', 'invoice-new', { type: 'other' })).toBeNull();
    expect(nav.locate('lookup', 'invoice-list')).toBeNull();
  });

  it('finds the area of a screen preferring the current one', () => {
    const { nav } = setup(['invoices.invoice.create', 'invoices.invoice.read', 'orders.order.read']);
    expect(nav.areaOf('order-list', {}, 'entry')).toBe('entry');
    expect(nav.areaOf('invoice-list', {}, 'entry')).toBe('lookup');
    expect(nav.areaOf('unknown')).toBeNull();
  });
});

describe('checkNavigation', () => {
  const engine = new ExpressionEngine({ can: () => false });

  it('reports nothing for a consistent document', () => {
    const screens = new Set(['invoice-new', 'order-list', 'invoice-list', 'x', 'y']);
    expect(checkNavigation({ ...definition, areas: definition.areas.map((u) => ({ ...u, items: u.items.filter((i) => i.id !== 'broken') })) }, engine, screens)).toEqual([]);
  });

  it('reports duplicate ids, missing default and screens, wrong expressions', () => {
    const broken: NavigationDefinition = {
      schemaVersion: '1.0',
      navigation: 'app',
      default: 'nobody',
      areas: [
        {
          id: 'uc',
          label: 'Uc',
          items: [
            { id: 'a', label: 'A', screen: 'exists' },
            { id: 'a', label: 'A2', screen: 'absent' },
            { id: 'b', label: 'B', screen: 'exists', visibleIf: '{{can(1)}}' },
          ],
        },
      ],
    };
    const messages = checkNavigation(broken, engine, new Set(['exists'])).map((i) => i.message);
    expect(messages.some((m) => m.includes('duplicate'))).toBe(true);
    expect(messages.some((m) => m.includes('unknown screen'))).toBe(true);
    expect(messages.some((m) => m.includes('unknown default area'))).toBe(true);
    expect(messages.some((m) => m.includes('invalid expression'))).toBe(true);
  });
});

describe('NavigationRuntime: translated labels', () => {
  it('evaluates t() in the labels and follows the language change', () => {
    const i18n = new I18n();
    i18n.addMessages('it', { 'nav.a': 'Alfa' });
    i18n.addMessages('en', { 'nav.a': 'Alpha' });
    const def: NavigationDefinition = {
      schemaVersion: '1.0',
      navigation: 'n',
      areas: [{ id: 'u', label: "{{ t('nav.u', 'Area') }}", items: [{ id: 'a', label: "{{ t('nav.a', 'A') }}", screen: 's' }] }],
    };
    const nav = new NavigationRuntime(def, {
      authorization: { can: () => true } as Authorization,
      userProvider: { user: () => ({}) } as UserProvider,
      i18n,
    });
    expect(nav.areas()[0].label).toBe('Area');
    expect(nav.areas()[0].items[0].label).toBe('Alpha');
    i18n.setLocale('it');
    expect(nav.areas()[0].items[0].label).toBe('Alfa');
    expect(nav.trail('u', 's')).toEqual(['Area', 'Alfa']);
  });
});
