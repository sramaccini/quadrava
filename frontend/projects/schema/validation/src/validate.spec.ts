import { validateNavigation, validateScreen, validateTheme } from './validate';

const minimal = () => ({
  schemaVersion: '1.0',
  screen: 'order-list',
  components: [{ type: 'text', text: 'Ciao' }],
});

function issuesOf(doc: unknown): string[] {
  const result = validateScreen(doc);
  return result.valid ? [] : result.issues.map((i) => `${i.path} ${i.message}`);
}

describe('validateScreen', () => {
  it('accepts a minimal screen', () => {
    expect(validateScreen(minimal()).valid).toBe(true);
  });

  it('accepts a table with an action conditioned by permissions', () => {
    const doc = {
      ...minimal(),
      requires: 'orders.order.read',
      dataSources: { ordini: { ref: 'orders/list' } },
      components: [
        {
          id: 'tabella-ordini',
          type: 'table',
          source: 'orders',
          columns: [{ field: 'numero' }],
          rowActions: [
            {
              label: 'Approve',
              visibleIf: "{{can('orders.order.approve') && row.status == 'submitted'}}",
              onClick: [{ call: 'approveOrder', onError: { toast: 'Error' } }, { refresh: 'orders' }],
            },
          ],
        },
      ],
    };
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rejects a screen without components', () => {
    expect(issuesOf({ schemaVersion: '1.0', screen: 'a' })).toContain('/ missing required property: components');
  });

  it('rejects an identifier not in kebab-case', () => {
    expect(issuesOf({ ...minimal(), screen: 'OrdiniElenco' }).some((m) => m.startsWith('/screen'))).toBe(true);
  });

  it('rejects an unknown component type', () => {
    const issues = issuesOf({ ...minimal(), components: [{ type: 'carosello' }] });
    expect(issues.some((m) => m.startsWith('/components/0/type'))).toBe(true);
  });

  it('rejects unexpected properties on a component', () => {
    const issues = issuesOf({ ...minimal(), components: [{ type: 'text', text: 'x', colore: 'rosso' }] });
    expect(issues).toContain('/components/0 unexpected property: colore');
  });

  it('an error inside a component does not get its legal properties reported as «unexpected»', () => {
    const table = { type: 'table', source: 'orders', columns: [{ field: 'n' }], rowActions: [{ label: 'X', onClick: [] }] };
    const issues = issuesOf({ ...minimal(), components: [table] });
    expect(issues.some((i) => i.startsWith('/components/0/rowActions/0/onClick'))).toBe(true);
    expect(issues.filter((i) => i.includes('non prevista'))).toEqual([]);
    // A really unknown property, without other errors, is still reported.
    expect(issuesOf({ ...minimal(), components: [{ ...table, rowActions: [], colore: 'rosso' }] })).toContain('/components/0 unexpected property: colore');
  });

  it('requires the properties specific to the type', () => {
    const issues = issuesOf({ ...minimal(), components: [{ type: 'table', source: 'orders' }] });
    expect(issues).toContain('/components/0 missing required property: columns');
  });

  it('rejects a condition without double braces', () => {
    const doc = { ...minimal(), components: [{ type: 'text', text: 'x', visibleIf: "can('a.b')" }] };
    expect(issuesOf(doc).some((m) => m.startsWith('/components/0/visibleIf'))).toBe(true);
  });

  it('rejects a malformed permission', () => {
    expect(issuesOf({ ...minimal(), requires: 'Orders' }).some((m) => m.startsWith('/requires'))).toBe(true);
  });

  it('rejects an unknown action step', () => {
    const doc = { ...minimal(), components: [{ type: 'button', label: 'Vai', onClick: [{ esegui: 'x' }] }] };
    expect(validateScreen(doc).valid).toBe(false);
  });

  it('validates the components nested in sections', () => {
    const doc = { ...minimal(), components: [{ type: 'section', components: [{ type: 'text' }] }] };
    expect(issuesOf(doc)).toContain('/components/0/components/0 missing required property: text');
  });
});

describe('validateTheme', () => {
  const base = {
    schemaVersion: '1.0',
    theme: 'test',
    tokens: {
      colors: { primary: '#123456', onPrimary: '#fff', background: '#fff', surface: '#fff', onSurface: '#000', border: 'rgb(1, 2, 3)' },
      typography: { fontFamily: 'Roboto, sans-serif', baseSize: 14 },
      shape: { radius: 4 },
      density: 'compact',
    },
  };

  it('accepts a valid theme', () => {
    expect(validateTheme(base).valid).toBe(true);
  });

  it('a brand of the application: relative, https or data:image addresses only', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+';
    expect(validateTheme({ ...base, brand: { name: 'Staff', logo: 'images/logo.svg', logoOnDark: 'https://cdn.example/logo.png', icon: svg, showName: true, height: 40 } }).valid).toBe(true);
    for (const logo of ['javascript:alert(1)', 'http://plain.example/logo.png', 'data:text/html;base64,PGI+', '//cdn.example/x.png', 'url(x)']) {
      expect(validateTheme({ ...base, brand: { logo } }).valid, logo).toBe(false);
    }
    expect(validateTheme({ ...base, brand: { height: 100 } }).valid).toBe(false);
    expect(validateTheme({ ...base, brand: { colour: 'red' } }).valid).toBe(false);
  });

  it('rejects colours that could inject CSS', () => {
    const bad = structuredClone(base);
    bad.tokens.colors.primary = 'red; background: url(http://evil)';
    expect(validateTheme(bad).valid).toBe(false);
  });

  it('rejects a font family with characters that are not allowed', () => {
    const bad = structuredClone(base);
    bad.tokens.typography.fontFamily = 'x}body{display:none';
    expect(validateTheme(bad).valid).toBe(false);
  });

  it('rejects unknown tokens and missing required colours', () => {
    const unknown = { ...base, tokens: { ...base.tokens, extra: 1 } };
    expect(validateTheme(unknown).valid).toBe(false);
    const missing = structuredClone(base) as { tokens: { colors: Record<string, string> } };
    delete missing.tokens.colors['primary'];
    expect(validateTheme(missing).valid).toBe(false);
  });
});

describe('validateNavigation', () => {
  const leaf = (id: string) => ({ id, label: id, screen: 'order-list' });
  const doc = (items: unknown[]) => ({
    schemaVersion: '1.0',
    navigation: 'app',
    areas: [{ id: 'uc', label: 'Caso', items }],
  });

  it('accepts an item, a group and three levels', () => {
    const items = [leaf('a'), { id: 'g1', label: 'G1', children: [leaf('b'), { id: 'g2', label: 'G2', children: [leaf('c')] }] }];
    expect(validateNavigation(doc(items)).valid).toBe(true);
  });

  it('rejects a fourth level', () => {
    const deep = [{ id: 'g1', label: 'G1', children: [{ id: 'g2', label: 'G2', children: [{ id: 'g3', label: 'G3', children: [leaf('x')] }] }] }];
    expect(validateNavigation(doc(deep)).valid).toBe(false);
  });

  it('rejects items without a screen or children, and groups without children', () => {
    expect(validateNavigation(doc([{ id: 'a', label: 'To' }])).valid).toBe(false);
    expect(validateNavigation(doc([{ id: 'g', label: 'G', children: [] }])).valid).toBe(false);
  });

  it('rejects unknown properties and invalid permissions', () => {
    expect(validateNavigation(doc([{ ...leaf('a'), color: 'red' }])).valid).toBe(false);
    expect(validateNavigation(doc([{ ...leaf('a'), requires: 'Permesso Maiuscolo' }])).valid).toBe(false);
  });
});

describe('permission format domain.resource.action', () => {
  it('accepts three parts and rejects two or four, in screens and navigation', () => {
    const screen = (requires: string) => ({ schemaVersion: '1.0', screen: 'x', requires, components: [{ type: 'text', text: 'a' }] });
    const nav = (requires: string) => ({ schemaVersion: '1.0', navigation: 'n', areas: [{ id: 'u', label: 'U', items: [{ id: 'a', label: 'To', screen: 's', requires }] }] });
    for (const make of [screen, nav]) {
      expect(JSON.stringify(validateAny(make, 'orders.order.approve'))).toContain('true');
      expect(JSON.stringify(validateAny(make, 'ordini.approva'))).toContain('false');
      expect(JSON.stringify(validateAny(make, 'a.b.c.d'))).toContain('false');
    }
  });
});

function validateAny(make: (r: string) => unknown, requires: string): { valid: boolean } {
  const doc = make(requires) as { navigation?: string };
  return doc.navigation ? validateNavigation(doc) : validateScreen(doc);
}

describe('new components: cell formats, tabs, detail, messages and confirmation', () => {
  const screen = (components: unknown[]) => ({ schemaVersion: '1.0', screen: 'x', components });

  it('accepts a table with formats, badge tones and conditional columns', () => {
    const doc = screen([
      {
        type: 'table',
        source: 'fatture',
        columns: [
          { field: 'importo', format: 'currency', currency: 'USD' },
          { field: 'stato', format: 'badge', badges: { pagata: 'success', scaduta: 'danger', bozza: 'neutral', inviata: 'primary' } },
          { field: 'iban', hiddenIf: "{{!can('orders.iban.read')}}" },
        ],
      },
    ]);
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rejects unexpected formats, tones and currencies', () => {
    const table = (column: object) => screen([{ type: 'table', source: 's', columns: [{ field: 'a', ...column }] }]);
    expect(issuesOf(table({ format: 'euro' })).length).toBeGreaterThan(0);
    expect(issuesOf(table({ format: 'badge', badges: { x: 'rosso' } })).length).toBeGreaterThan(0);
    expect(issuesOf(table({ format: 'currency', currency: 'euro' })).length).toBeGreaterThan(0);
  });

  it('accepts nested tabs with conditions, detail panels and messages', () => {
    const doc = screen([
      { type: 'alert', text: 'Attenzione', kind: 'error', visibleIf: '{{true}}' },
      {
        type: 'tabs',
        tabs: [
          { label: 'Date', components: [{ type: 'detail', source: 'order', title: 'Order', fields: [{ field: 'customer' }, { field: 'discount', format: 'percent' }] }] },
          { id: 'bank', label: 'Bank details', visibleIf: "{{can('orders.iban.read')}}", components: [{ type: 'tabs', tabs: [{ label: 'Internal', components: [] }] }] },
        ],
      },
    ]);
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rejects empty tabs, details without fields and messages of an unknown kind', () => {
    expect(issuesOf(screen([{ type: 'tabs', tabs: [] }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'tabs', tabs: [{ components: [] }] }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'detail', source: 's', fields: [] }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'alert', text: 'x', kind: 'warning' }])).length).toBeGreaterThan(0);
    expect(issuesOf(screen([{ type: 'alert', text: 'x', colore: 'rosso' }])).length).toBeGreaterThan(0);
  });

  it('accepts the confirm step and rejects wrong shapes', () => {
    const button = (onClick: unknown[]) => screen([{ type: 'button', label: 'Vai', onClick }]);
    expect(issuesOf(button([{ confirm: "Approvare l'ordine {{row.numero}}?" }, { toast: 'Done' }]))).toEqual([]);
    expect(issuesOf(button([{ confirm: 5 }])).length).toBeGreaterThan(0);
    expect(issuesOf(button([{ confirm: 'ok', titolo: 'x' }])).length).toBeGreaterThan(0);
  });
});
