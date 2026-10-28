import type { DataRequest } from 'core';
import { MedicalStaffRegister } from './demo-medical-staff';
import { transactionArchive, searchTransactions } from './demo-search';

interface Invoice { id: number; number: string; customer: string; type: string; amount: number; status: 'draft' | 'sent' | 'paid'; issued: string; collected: boolean; rows: number; rate: number }
interface Package { id: number; name: string; description: string; created: string }
interface Expense { id: number; description: string; employee: string; amount: number; status: 'to-review' | 'accepted' | 'rejected' }

interface Order {
  id: number;
  number: string;
  customer: string;
  status: 'draft' | 'submitted' | 'approved';
  type: 'private' | 'business';
  discount: number;
  iban: string;
}

/** Server-side sorting of the demo: parameters `sort` (field) and `dir` (`asc` or `desc`). */
function sortBy<T extends object>(rows: T[], query: DataRequest['query']): T[] {
  const field = query?.['sort'];
  if (typeof field !== 'string' || !field) return rows;
  const sign = query?.['dir'] === 'desc' ? -1 : 1;
  const value = (row: T): unknown => (row as Record<string, unknown>)[field];
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return sign * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true }));
  });
}

const CUSTOMERS = ['Smith Ltd', 'Baker Inc', 'Walker & Co.', 'Nolan Group'];
const MONTHS = ['July', 'August', 'September', 'October'];

/**
 * In-memory back end of the demo: same shape as the REST responses the catalogue expects (items/total/size, _perm).
 * It does not depend on Angular: the browser uses it (MockDataClient, demo without services) and so does the sample
 * server (tools/demo-api.mjs, behind the BFF). An error is reported by throwing `Error('<HTTP status>')`; a request that
 * matches nothing returns `undefined` (404 for the server).
 */
export class DemoBackend {
  static readonly PAGE_SIZE = 8;
  private readonly orders: Order[] = Array.from({ length: 21 }, (_, i) => ({
    id: i + 1,
    number: `ORD-${String(i + 1).padStart(4, '0')}`,
    customer: CUSTOMERS[i % 4],
    status: (['draft', 'submitted', 'approved'] as const)[i % 3],
    type: i % 2 ? 'business' : 'private',
    discount: i % 2 ? 10 : 0,
    iban: `IT60X0542811101${String(i).padStart(12, '0')}`,
  }));

  private readonly invoices: Invoice[] = Array.from({ length: 14 }, (_, i) => ({
    id: 100 + i,
    number: `FT-2026-${String(i + 1).padStart(3, '0')}`,
    customer: CUSTOMERS[i % 4],
    type: i % 3 === 2 ? 'purchase' : 'sales',
    amount: 250 + i * 135,
    status: (['draft', 'sent', 'paid'] as const)[i % 3],
    issued: `2026-09-${String(i + 1).padStart(2, '0')}`,
    collected: i % 3 === 2,
    rows: 1 + (i % 5),
    rate: i % 4 === 3 ? 10 : 22,
  }));
  /** Customer register for the lookup fields: searched by name or city. */
  private readonly customers = [
    'Smith Ltd|Milan', 'Baker Inc|Turin', 'Walker & Co.|Bologna', 'Nolan Group|Rome', 'Smithson Inc|Florence', 'Brown Logistics|Verona',
    'Dove Systems|Bergamo', 'Smithers Parts|Modena', 'Exposure Foods|Naples', 'Roman Textiles|Prato', 'Curly Consulting|Genoa',
    'Marine Builders|Bari', 'Greek Transport|Palermo', 'Rooster Energy|Padua', 'Count Software|Trento',
  ].map((entry, i) => ({ id: i + 1, name: entry.split('|')[0], city: entry.split('|')[1] }));
  private attachments = 0;
  /** The staff service of the medical-staff sample project (samples/medical-staff). */
  private readonly medicalStaff = new MedicalStaffRegister(DemoBackend.PAGE_SIZE);
  private reports = 0;
  /** Staff numbers already used (validation showcase). */
  private readonly staffNumbers = new Set(['S000001', 'S123456']);
  /** Tasks of the showcase kanban: the status changes with /api/tasks/{id}/move. */
  private readonly tasks: { id: number; title: string; who: string; status: string }[] = [
    { id: 1, title: 'Quote for Smith Ltd', who: 'Anna', status: 'to-do' },
    { id: 2, title: 'Contract for Baker Inc', who: 'Luca', status: 'to-do' },
    { id: 3, title: 'Invoice FT-2026-012', who: 'Anna', status: 'in-progress' },
    { id: 4, title: 'Reminder to Walker & Co.', who: 'Marta', status: 'in-progress' },
    { id: 5, title: 'Order 1001 shipped', who: 'Luca', status: 'done' },
  ];
  /** Transactions for the datatable: 60 deterministic rows over three accounts and six categories, from July to October 2026. */
  private readonly transactions = Array.from({ length: 60 }, (_, i) => {
    const categories = ['Rent', 'Utilities', 'Salaries', 'Customer receipts', 'Suppliers', 'Sundry expenses'];
    const category = categories[(i * 7) % categories.length];
    const income = category === 'Customer receipts';
    const base = { Rent: 1800, Utilities: 240, Salaries: 3100, 'Customer receipts': 2600, Suppliers: 950, 'Sundry expenses': 75 }[category] ?? 100;
    const amount = Math.round((base + ((i * 37) % 11) * (base / 20)) * 100) / 100;
    const month = 7 + (i % 4);
    const day = 1 + ((i * 5) % 27);
    return {
      id: 1000 + i,
      date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      account: ['Alpha Bank', 'Beta Bank', 'Cash'][i % 3 === 2 && category !== 'Sundry expenses' ? 0 : i % 3],
      category,
      description: `${category} ${MONTHS[month - 7]} no. ${i + 1}`,
      amount: income ? amount : -amount,
      status: i % 9 === 4 ? 'to-check' : 'registered',
    };
  });
  private readonly contacts: { id: number; name: string; email: string; role: string }[] = [
    { id: 1, name: 'Anna Conti', email: 'anna.conti@example.com', role: 'purchases' },
    { id: 2, name: 'Luca Fabbri', email: 'luca.fabbri@example.com', role: 'administration' },
  ];
  private readonly packages: Package[] = [
    { id: 1, name: 'September closing', description: 'Sales invoices of the month', created: '2026-10-01' },
    { id: 2, name: 'Suppliers Q3', description: 'Purchase invoices of the quarter', created: '2026-09-28' },
  ];
  private readonly expenses: Expense[] = Array.from({ length: 12 }, (_, i) => ({
    id: 500 + i,
    description: ['Train Milan-Rome', 'Hotel', 'Dinner with a customer', 'Taxi', 'Office supplies'][i % 5],
    employee: ['M. Conti', 'L. Fabbri', 'S. Greco'][i % 3],
    amount: 18 + i * 21,
    status: (['to-review', 'to-review', 'accepted', 'rejected'] as const)[i % 4],
  }));

  async handle(req: DataRequest): Promise<unknown> {
    const path = req.url.split('?')[0];
    if (path === '/api/medical-staff' || path.startsWith('/api/medical-staff/')) return this.medicalStaff.handle(req, path);

    if (req.method === 'GET' && path === '/api/orders') {
      const status = req.query?.['status'];
      const page = Number(req.query?.['page'] ?? 0);
      const filtered = sortBy(this.orders.filter((o) => !status || o.status === status), req.query);
      const size = DemoBackend.PAGE_SIZE;
      return { items: filtered.slice(page * size, page * size + size).map((o) => this.view(o)), total: filtered.length, size };
    }
    const detail = /^\/api\/orders\/(\d+)$/.exec(path);
    if (detail) {
      const order = this.orders.find((o) => o.id === Number(detail[1]));
      if (!order) throw new Error('404');
      if (req.method === 'GET') return this.view(order);
      if (req.method === 'PUT') {
        const body = req.body ?? {};
        Object.assign(order, { customer: body['customer'] ?? order.customer, type: body['type'] ?? order.type, discount: body['discount'] ?? order.discount });
        return this.view(order);
      }
    }
    const approve = /^\/api\/orders\/(\d+)\/approve$/.exec(path);
    if (approve && req.method === 'POST') {
      const order = this.orders.find((o) => o.id === Number(approve[1]));
      if (!order || order.status !== 'submitted') throw new Error('409');
      order.status = 'approved';
      return {};
    }
    // Staff numbers already used (made up): the remote rule of the validation showcase asks here while the user types.
    if (path === '/api/showcase/staff/check' && req.method === 'GET') {
      return { valid: !this.staffNumbers.has(String(req.query?.['number'] ?? '').toUpperCase()), code: 'staffNumberTaken' };
    }
    // Saving repeats the checks of the screen, as every service must, plus one of its own (a blocked e-mail domain): the
    // problems come back as field errors in the Problem (contracts/problem.yaml).
    if (path === '/api/showcase/staff' && req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const number = String(body['staffNumber'] ?? '').toUpperCase();
      const errors: { path: string; code: string }[] = [];
      if (!/^S\d{6}$/.test(number)) errors.push({ path: '/staffNumber', code: 'pattern' });
      else if (this.staffNumbers.has(number)) errors.push({ path: '/staffNumber', code: 'staffNumberTaken' });
      if (String(body['email'] ?? '').toLowerCase().endsWith('@example.org')) errors.push({ path: '/email', code: 'emailDomainBlocked' });
      if (errors.length) throw Object.assign(new Error('422'), { status: 422, fieldErrors: errors });
      this.staffNumbers.add(number);
      return { staffNumber: number };
    }
    // Newsletter of the validation showcase, from standalone fields: the same blocked domain as above.
    if (path === '/api/showcase/subscribe' && req.method === 'POST') {
      const email = String(((req.body ?? {}) as Record<string, unknown>)['email'] ?? '').toLowerCase();
      if (email.endsWith('@example.org')) throw Object.assign(new Error('422'), { status: 422, fieldErrors: [{ path: '/email', code: 'emailDomainBlocked' }] });
      return { subscribed: true };
    }
    // A report returns its protocol number (the following steps read it with `as`).
    if (path === '/api/showcase/flag' && req.method === 'POST') return { protocol: `PR-${String(++this.reports).padStart(4, '0')}`, receipt: true };
    // Always in conflict: to try onError with error.status.
    if (path === '/api/showcase/conflict' && req.method === 'POST') throw new Error('409');
    if (path === '/api/showcase/error') throw new Error('500');
    const other = this.handleBilling(req, path);
    if (other !== undefined) return other;
    throw new Error(`404 ${req.method} ${req.url}`);
  }

  private page<T>(rows: T[], query: DataRequest['query']): { items: T[]; total: number; size: number } {
    const size = DemoBackend.PAGE_SIZE;
    const page = Number(query?.['page'] ?? 0);
    return { items: rows.slice(page * size, page * size + size), total: rows.length, size };
  }

  /** Invoices, packages and expenses: the data of the sample areas. */
  private handleBilling(req: DataRequest, path: string): unknown {
    if (path === '/api/invoices' && req.method === 'GET') {
      // status: one value or a list (multiple selection); type: sales or purchase.
      const status = req.query?.['status'];
      const statuses = Array.isArray(status) ? status : status ? [status] : [];
      const type = req.query?.['type'];
      const customer = req.query?.['customer'];
      const match = (f: Invoice): boolean => (statuses.length === 0 || statuses.includes(f.status)) && (!type || f.type === type) && (!customer || f.customer === customer);
      return this.page(this.invoices.filter(match).map((f) => ({ ...f })), req.query);
    }
    if (path === '/api/invoices' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['number'] || !body['customer']) throw new Error('400');
      const id = Math.max(...this.invoices.map((f) => f.id)) + 1;
      this.invoices.unshift({ id, number: String(body['number']), customer: String(body['customer']), type: String(body['type'] ?? 'sales'), amount: Number(body['amount'] ?? 0), status: 'draft', issued: '2026-10-07', collected: false, rows: 1, rate: 22 });
      return { id };
    }
    if (path === '/api/invoices/send' && req.method === 'POST') {
      const ids = Array.isArray(req.body?.['ids']) ? (req.body['ids'] as unknown[]) : [];
      const drafts = this.invoices.filter((f) => ids.includes(f.id) && f.status === 'draft');
      if (drafts.length !== ids.length) throw new Error('409');
      drafts.forEach((f) => (f.status = 'sent'));
      return { sent: drafts.length };
    }
    const send = /^\/api\/invoices\/(\d+)\/send$/.exec(path);
    if (send && req.method === 'POST') {
      const invoice = this.invoices.find((f) => f.id === Number(send[1]));
      if (!invoice || invoice.status !== 'draft') throw new Error('409');
      invoice.status = 'sent';
      return {};
    }
    if (path === '/api/deadlines' && req.method === 'GET') {
      // Fake deadlines for any month YYYY-MM: always the same days, with different statuses.
      const month = String(req.query?.['month'] ?? '');
      if (!/^\d{4}-\d{2}$/.test(month)) return [];
      const items: [number, string, string][] = [
        [3, 'Office rent', 'paid'], [8, 'Social security payment', 'to-pay'], [8, 'Supplier Brown', 'overdue'], [8, 'Car lease', 'to-pay'],
        [8, 'Insurance', 'paid'], [12, 'Utilities', 'to-pay'], [15, 'Salaries', 'to-pay'], [22, 'Supplier Dove', 'overdue'], [28, 'Quarterly VAT', 'to-pay'],
      ];
      return items.map(([day, title, status], i) => ({ id: i + 1, date: `${month}-${String(day).padStart(2, '0')}`, title, status, amount: 150 + i * 220 }));
    }
    if (path === '/api/categories' && req.method === 'GET') {
      const leaf = (id: string, name: string, items: number): Record<string, unknown> => ({ id, name, items, children: [] });
      return [
        { id: 'pur', name: 'Purchases', items: 42, children: [leaf('pur-sta', 'Stationery', 12), leaf('pur-it', 'IT', 18), leaf('pur-fur', 'Furniture', 12)] },
        { id: 'ser', name: 'Services', items: 27, children: [leaf('ser-con', 'Consulting', 9), { id: 'ser-mnt', name: 'Maintenance', items: 18, children: [leaf('ser-mnt-sys', 'Systems', 11), leaf('ser-mnt-bld', 'Buildings', 7)] }] },
        { id: 'stf', name: 'Staff', items: 35, children: [{ id: 'stf-trv', name: 'Business travel', items: 25, children: [leaf('stf-trv-trn', 'Trains', 10), leaf('stf-trv-htl', 'Hotel', 15)] }, leaf('stf-trn', 'Training', 10)] },
      ];
    }
    if (path === '/api/transactions/search' && req.method === 'POST') return searchTransactions(transactionArchive(), req.body);
    const verify = /^\/api\/transactions\/(\d+)\/check$/.exec(path);
    if (verify && req.method === 'POST') {
      const row = transactionArchive().find((m) => m['id'] === Number(verify[1]));
      if (!row) throw new Error('404');
      row['status'] = 'registered';
      return {};
    }
    if (path === '/api/transactions' && req.method === 'GET') {
      // With count=N (up to 50,000) a larger synthetic archive, to try the datatable with a lot of data.
      const count = Math.min(50000, Number(req.query?.['count'] ?? 0));
      if (count > 0) return Array.from({ length: count }, (_, i) => ({ ...this.transactions[i % this.transactions.length], id: 100000 + i, description: `Transaction ${i + 1}` }));
      return this.transactions.map((m) => ({ ...m }));
    }
    if (path === '/api/monthly-sales' && req.method === 'GET') {
      // Twelve months of 2026 with a recognisable seasonal trend.
      return Array.from({ length: 12 }, (_, i) => {
        const sales = 9000 + Math.round(4000 * Math.sin((i + 1) / 2)) + i * 600;
        const purchases = 6000 + Math.round(2500 * Math.cos(i / 2)) + i * 300;
        // Margin in percentage points, with one decimal digit.
        return { month: `2026-${String(i + 1).padStart(2, '0')}`, sales, purchases, margin: Math.round(((sales - purchases) / sales) * 1000) / 10 };
      });
    }
    if (path === '/api/invoices-by-status' && req.method === 'GET') {
      const count = (status: string): number => this.invoices.filter((f) => f.status === status).length;
      return ['draft', 'sent', 'paid'].map((status) => ({ status, number: count(status) }));
    }
    if (path === '/api/summary' && req.method === 'GET') {
      const sales = this.invoices.filter((f) => f.type === 'sales');
      const sum = (rows: Invoice[]): number => rows.reduce((t, f) => t + f.amount, 0);
      return {
        revenue: sum(sales),
        toCollect: sum(sales.filter((f) => f.status === 'sent')),
        open: this.invoices.filter((f) => f.status !== 'paid').length,
        total: this.invoices.length,
        customers: new Set(this.invoices.map((f) => f.customer)).size,
        growth: 12.5,
      };
    }
    if (path === '/api/articles' && req.method === 'GET') {
      const articles = [
        ['CAR-A4', 'A4 paper ream'], ['CAR-A3', 'A3 paper ream'], ['GRA-01', 'Paper clips'], ['PEN-BL', 'Blue pens'], ['PEN-RO', 'Red pens'],
        ['MAT-HB', 'HB pencils'], ['EVI-GI', 'Yellow highlighters'], ['CAR-RA', 'Ring binders'], ['TON-01', 'Printer toner'], ['BUS-A4', 'A4 envelopes'],
      ].map(([code, name]) => ({ code, name }));
      const id = req.query?.['id'];
      if (id !== undefined) return articles.filter((a) => a.code === id);
      const q = String(req.query?.['q'] ?? '').toLowerCase();
      return articles.filter((a) => !q || a.name.toLowerCase().includes(q)).slice(0, 6);
    }
    if (path === '/api/contacts' && req.method === 'GET') return this.contacts.map((c) => ({ ...c }));
    if (path === '/api/contacts' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['name'] || !String(body['email'] ?? '').includes('@')) throw new Error('400');
      const id = Math.max(0, ...this.contacts.map((c) => c.id)) + 1;
      this.contacts.push({ id, name: String(body['name']), email: String(body['email']), role: String(body['role'] ?? 'purchases') });
      return { id };
    }
    const contact = /^\/api\/contacts\/(\d+)$/.exec(path);
    if (contact && req.method === 'PUT') {
      const found = this.contacts.find((c) => c.id === Number(contact[1]));
      const body = req.body ?? {};
      if (!found || !body['name'] || !String(body['email'] ?? '').includes('@')) throw new Error('400');
      Object.assign(found, { name: String(body['name']), email: String(body['email']), role: String(body['role'] ?? found.role) });
      return { ...found };
    }
    if (path === '/api/attachments' && req.method === 'POST') {
      // A real service would store the file; here it is enough to check that it arrived (as a file or in base64) and answer with an id.
      if (req.file) {
        if (!(req.file.blob instanceof Blob) || req.file.blob.size !== req.body?.['size']) throw new Error('400');
      } else {
        const content = req.body?.['content'];
        if (typeof content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('400');
      }
      this.attachments += 1;
      return { id: this.attachments };
    }
    if (path === '/api/tasks' && req.method === 'GET') return this.tasks.map((t) => ({ ...t }));
    if (path === '/api/menu/counters' && req.method === 'GET') {
      // Menu counters: draft invoices, expenses to review, tasks not finished.
      return {
        drafts: this.invoices.filter((f) => f.status === 'draft').length,
        'to-review': this.expenses.filter((s) => s.status === 'to-review').length,
        'showcase-tasks': this.tasks.filter((t) => t.status !== 'done').length,
      };
    }
    const move = /^\/api\/tasks\/(\d+)\/move$/.exec(path);
    if (move && req.method === 'POST') {
      const task = this.tasks.find((t) => t.id === Number(move[1]));
      const status = req.body?.['status'];
      if (!task) throw new Error('404');
      if (typeof status !== 'string' || !['to-do', 'in-progress', 'done'].includes(status)) throw new Error('400');
      task.status = status;
      return {};
    }
    if (path === '/api/events' && req.method === 'GET') {
      return [
        { date: '2026-10-01T09:15', title: 'Order 1001 received', note: 'From the customer portal', outcome: 'ok' },
        { date: '2026-10-02T11:40', title: 'Order 1001 approved', note: 'By Luca, manager', outcome: 'ok' },
        { date: '2026-10-03T16:05', title: 'Shipment delayed', note: 'The courier reports a one-day delay', outcome: 'ko' },
        { date: '2026-10-05T10:00', title: 'Order 1001 delivered', outcome: 'ok' },
      ];
    }
    if (path === '/api/customers' && req.method === 'GET') {
      // Case-insensitive search on name and city; at most 8 results.
      // With id: the row of that customer (to show the text of a value already chosen).
      const id = req.query?.['id'];
      if (id !== undefined) return this.customers.filter((c) => String(c.id) === String(id));
      const q = String(req.query?.['q'] ?? '').toLowerCase();
      return this.customers.filter((c) => !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q)).slice(0, 8);
    }
    if (path === '/api/packages' && req.method === 'GET') return this.packages.map((p) => ({ ...p }));
    if (path === '/api/packages' && req.method === 'POST') {
      const body = req.body ?? {};
      if (!body['name']) throw new Error('400');
      this.packages.unshift({ id: this.packages.length + 1, name: String(body['name']), description: String(body['description'] ?? ''), created: '2026-10-07' });
      return {};
    }
    if (path === '/api/expenses' && req.method === 'GET') {
      const status = req.query?.['status'];
      const match = (e: Expense): boolean => !status || (status === 'reviewed' ? e.status !== 'to-review' : e.status === status);
      return this.page(this.expenses.filter(match).map((e) => ({ ...e })), req.query);
    }
    const review = /^\/api\/expenses\/(\d+)\/review$/.exec(path);
    if (review && req.method === 'POST') {
      const expense = this.expenses.find((e) => e.id === Number(review[1]));
      const outcome = req.body?.['outcome'];
      if (!expense || expense.status !== 'to-review' || (outcome !== 'accepted' && outcome !== 'rejected')) throw new Error('409');
      expense.status = outcome;
      return {};
    }
    return undefined;
  }

  private view(o: Order): Record<string, unknown> {
    return { ...o, _perm: { update: o.status !== 'approved' } };
  }
}
