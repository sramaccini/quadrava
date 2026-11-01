import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { DemoDiagnostics } from '../demo/demo-ports';
import { openSelect, stubViewportHeight } from './select-testing';
import { cells, headerCell, openShowcase, plainText, setupShowcase, teardownShowcase } from './showcase-testing';

/** The showcase screens for the components added after the first version: they open without errors and do what they say. */
describe('Showcase: advanced components', () => {
  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());
  beforeEach(() => setupShowcase());
  afterEach(() => teardownShowcase());

  describe('advanced tables', () => {
    it('sorting: server-side for the orders, in the page for the invoices', async () => {
      const diagnostics = TestBed.inject(DemoDiagnostics);
      const { el, until } = await openShowcase('/showcase/showcase-advanced-tables');
      // Orders: number descending on opening, decided by the service.
      await until(() => cells(el, 0, 0).length === 8, 'orders');
      expect(cells(el, 0, 0)[0]).toBe('ORD-0021');
      headerCell(el, 0, 'Customer').click();
      await until(() => cells(el, 0, 1)[0] === 'Baker Inc', 'orders by customer');
      // Invoices: in-page sorting on the amount.
      await until(() => cells(el, 1, 0).length === 8, 'invoices');
      headerCell(el, 1, 'Amount (€)').click();
      await until(() => cells(el, 1, 3)[0]?.includes('250'), 'amount ascending');
      headerCell(el, 1, 'Amount (€)').click();
      await until(() => /1,?195/.test(cells(el, 1, 3)[0] ?? ''), 'amount descending');
      expect(diagnostics.events(), JSON.stringify(diagnostics.events())).toEqual([]);
    });

    it('selection: two drafts sent together, with confirmation; with an invoice already sent the action stays disabled', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-advanced-tables');
      const table = (): Element => el.querySelectorAll('main nz-table')[2];
      const boxes = (): HTMLInputElement[] => [...table().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
      const send = (): HTMLButtonElement => [...el.querySelectorAll<HTMLButtonElement>('main .bulk button')].find((b) => b.textContent?.includes('Send selected'))!;
      await until(() => cells(el, 2, 1).length === 8, 'invoices');
      expect(cells(el, 2, 3).slice(0, 4)).toEqual(['Draft', 'Sent', 'Paid', 'Draft']);
      boxes()[2].click(); // row 2: sent
      await until(() => !!el.querySelector('main .bulk .count')?.textContent?.includes('1 row'), 'one row');
      expect(send().disabled).toBe(true);
      boxes()[2].click();
      boxes()[1].click();
      boxes()[4].click();
      await until(() => !!el.querySelector('main .bulk .count')?.textContent?.includes('2 rows'), 'two rows');
      expect(send().disabled).toBe(false);
      send().click();
      await until(() => !!document.querySelector('.ant-modal-confirm-btns'), 'confirmation');
      expect(document.querySelector('.ant-modal-confirm-content')?.textContent).toContain('Send 2 invoices?');
      ([...document.querySelectorAll('.ant-modal-confirm-btns')].at(-1)!.querySelectorAll('button')[1] as HTMLButtonElement).click();
      await until(() => cells(el, 2, 3)[0] === 'Sent' && cells(el, 2, 3)[3] === 'Sent', 'invoices sent');
      expect(el.querySelector('main .bulk .count')?.textContent).toContain('No rows selected');
    });

    it('actions menu: one button per row, the other actions in the «⋯» menu', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-advanced-tables');
      await until(() => cells(el, 3, 0).length === 8, 'invoices');
      const rows = [...el.querySelectorAll('main nz-table')[3].querySelectorAll('tbody tr')];
      const inline = (i: number): string[] => [...rows[i].querySelectorAll('.actions > span button')].map((b) => b.textContent!.trim());
      expect(inline(0)).toEqual(['Send']);
      expect(inline(1)).toEqual(['Send']);
      expect((rows[1].querySelector('.actions > span button') as HTMLButtonElement).disabled).toBe(true);
      (rows[1].querySelector('button.more') as HTMLButtonElement).click();
      const items = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-dropdown li.lc-row-action')];
      await until(() => items().length === 2, 'menu of the second row');
      expect(items().map((i) => i.textContent!.trim())).toEqual(['Duplicate', 'Send a payment reminder']);
      items()[1].click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Reminder sent to Baker Inc');
    });

    it('expandable rows: the area shows the data of the row and the button opens the order', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-advanced-tables');
      await until(() => cells(el, 4, 1).length === 8, 'orders');
      const rows = (): Element[] => [...el.querySelectorAll('main nz-table')[4].querySelectorAll('tbody tr:not(.lc-extra-row)')];
      // ORD-0021 is approved: it does not expand.
      expect(rows()[0].querySelector('button.ant-table-row-expand-icon')).toBeNull();
      (rows()[1].querySelector('button.ant-table-row-expand-icon') as HTMLButtonElement).click();
      (rows()[2].querySelector('button.ant-table-row-expand-icon') as HTMLButtonElement).click();
      await until(() => el.querySelectorAll('main nz-table')[4].querySelectorAll('tr.lc-extra-row').length === 2, 'two areas open');
      const areas = [...el.querySelectorAll('main nz-table')[4].querySelectorAll('tr.lc-extra-row')];
      expect(areas[0].textContent).toContain('Customer Nolan Group, discount 10%.');
      expect(areas[0].textContent).not.toContain('Draft order');
      expect(areas[1].textContent).toContain('Draft order');
      ([...areas[1].querySelectorAll('button')].find((b) => b.textContent?.includes('Open the order')) as HTMLButtonElement).click();
      await until(() => TestBed.inject(Location).path().startsWith('/showcase/order-detail'), 'navigation');
      expect(TestBed.inject(Location).path()).toContain('id=19');
    });

    it('numbers, links and totals: totals row over the loaded rows and clickable number', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-advanced-tables');
      await until(() => cells(el, 5, 0).length === 8, 'invoices');
      expect(cells(el, 5, 2).slice(0, 3)).toEqual(['1', '2', '3']);
      const totals = [...el.querySelectorAll('main nz-table')[5].querySelectorAll('tfoot tr.totals td')].map((td) => plainText(td.textContent));
      expect(totals).toEqual(['Total', 'Count 8', '21', 'Average 19 %', '€5,780.00']);
      (el.querySelectorAll('main nz-table')[5].querySelector('tbody button.cell-link') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('You opened invoice FT-2026-001');
    });
  });

  describe('fields and forms', () => {
    const pick = async (until: (c: () => boolean, l: string) => Promise<void>, settle: () => Promise<void>, select: Element, labels: string[]): Promise<void> => {
      await openSelect(select, settle);
      await until(() => document.querySelectorAll('.ant-select-item-option').length > 0, 'options');
      const options = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      for (const label of labels) { const option = options.find((o) => o.textContent?.trim() === label); if (!option) throw new Error('opzioni: ' + JSON.stringify(options.map((o) => o.textContent))); option.click(); }
      await until(() => true, 'choice');
    };

    it('new field types: the form collects text area, radio, switch and multiple selection', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-fields');
      const form = el.querySelector('main lc-form') as HTMLElement;
      expect((form.querySelector('nz-date-picker input') as HTMLInputElement).value).toBe('20/10/2026 09:30');
      const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'Citofonare Rossi';
      textarea.dispatchEvent(new Event('input'));
      const radios = [...form.querySelectorAll<HTMLElement>('label[nz-radio]')];
      expect(radios.map((r) => r.textContent?.trim())).toEqual(['Low', 'Normal', 'High']);
      (radios[2].querySelector('input') as HTMLInputElement).click();
      (form.querySelector('nz-switch button') as HTMLButtonElement).click();
      await pick(until, settle, form.querySelector('nz-select')!, ['Text message']);
      ([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Send') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Priority high, express shipping, notifications on 2 channels');
    });

    it('new types in the filters: several statuses together and type with «Tutti»', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-fields');
      await until(() => cells(el, 1, 0).length === 8, 'invoices');
      const bar = el.querySelector('main lc-filter-bar') as HTMLElement;
      await pick(until, settle, bar.querySelector('nz-select')!, ['Draft', 'Paid']);
      await until(() => cells(el, 1, 2).every((c) => c === 'Draft' || c === 'Paid') && cells(el, 1, 2).includes('Paid'), 'two statuses');
      const radios = [...bar.querySelectorAll<HTMLInputElement>('nz-radio-group input')];
      radios[2].click();
      await until(() => cells(el, 1, 1).length > 0 && cells(el, 1, 1).every((c) => c === 'Purchase'), 'purchases only');
      radios[0].click();
      await until(() => cells(el, 1, 1).includes('Sales'), 'all types');
    });

    it('lookup: searches the customers while typing, in the form and in the filters', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-fields');
      const form = el.querySelectorAll('main lc-form')[1] as HTMLElement;
      // The form starts with customer 12, which is not among the first rows: the field shows its name anyway.
      await until(() => form.querySelector('lc-lookup .ant-select-selection-item')?.textContent?.trim() === 'Marine Builders', 'name of the initial value');
      await openSelect(form.querySelector('lc-lookup nz-select')!, settle);
      const search = form.querySelector('input.ant-select-selection-search-input') as HTMLInputElement;
      search.value = 'mila';
      search.dispatchEvent(new Event('input'));
      const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      // The value already chosen stays in the list next to the search results.
      await until(() => options().map((o) => o.textContent?.trim()).join('|') === 'Marine Builders|Smith Ltd', 'search result');
      options()[1].click();
      ([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Confirm') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Customer chosen: id 1');
      document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
      // In the filters the value is the customer name and the table is filtered.
      const bar = el.querySelector('main lc-filter-bar') as HTMLElement;
      await openSelect(bar.querySelector('lc-lookup nz-select')!, settle);
      await until(() => options().some((o) => o.textContent?.trim() === 'Baker Inc'), 'customers');
      options().find((o) => o.textContent?.trim() === 'Baker Inc')!.click();
      await until(() => cells(el, 1, 0).length > 0 && cells(el, 1, 0).length < 8, 'invoices of Baker');
      expect(cells(el, 1, 0)).toEqual(['FT-2026-002', 'FT-2026-006', 'FT-2026-010', 'FT-2026-014']);
    });

    it('file upload: the file leaves at once, the service answers with an id and the form saves it', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-fields');
      const field = el.querySelector('main lc-file-field') as HTMLElement;
      const input = field.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['%PDF-1.7'], 'contratto.pdf', { type: 'application/pdf' })] });
      input.dispatchEvent(new Event('change'));
      await until(() => field.querySelector('.name')?.textContent?.trim() === 'contratto.pdf', 'file uploaded');
      const form = field.closest('lc-form') as HTMLElement;
      ([...form.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Attachment contratto.pdf saved (id 1)');
    });

    it('grid: the profile form has three columns and wide fields take several columns', async () => {
      const { el } = await openShowcase('/showcase/showcase-fields');
      const form = [...el.querySelectorAll<HTMLElement>('main lc-form form')].find((f) => f.classList.contains('grid'))!;
      expect(form.style.getPropertyValue('--lc-form-columns')).toBe('3');
      const spans = [...form.querySelectorAll<HTMLElement>(':scope > nz-form-item')].map((i) => i.style.getPropertyValue('--lc-field-span'));
      expect(spans).toEqual(['2', '1', '2', '1', '1', '1', '1', '3']);
    });

    it('repeatable rows: a new row must be completed before saving', async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-fields');
      const repeater = el.querySelector('main lc-repeater') as HTMLElement;
      const form = repeater.closest('lc-form') as HTMLElement;
      const rows = (): HTMLElement[] => [...repeater.querySelectorAll<HTMLElement>('tbody tr')];
      expect(rows()).toHaveLength(1);
      // The article of the initial row is a code: the lookup shows its name, asked of the service.
      await until(() => rows()[0].querySelector('lc-lookup .ant-select-selection-item')?.textContent?.trim() === 'Printer toner', 'initial article');
      ([...repeater.querySelectorAll('button')].find((b) => b.textContent?.includes('Add an item')) as HTMLButtonElement).click();
      await settle();
      const save = (): void => ([...form.querySelectorAll(':scope form > .actions button')].find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement).click();
      save();
      await until(() => repeater.querySelectorAll('.cell-error').length === 2, 'errors of the new row');
      const second = rows()[1];
      await openSelect(second.querySelector('lc-lookup nz-select')!, settle);
      await until(() => [...document.querySelectorAll('.ant-select-item-option')].some((o) => o.textContent?.trim() === 'Paper clips'), 'articles');
      ([...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => o.textContent?.trim() === 'Paper clips'))!.click();
      const quantity = second.querySelector('input[type="number"]') as HTMLInputElement;
      quantity.value = '3';
      quantity.dispatchEvent(new Event('input'));
      await settle();
      save();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Order saved with 2 lines');
    });

    it('dialog with form: new contact and editing of a row, with the table reloaded', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-fields');
      await until(() => cells(el, 0, 0).length === 2, 'contacts');
      const dialog = (): HTMLElement => [...document.querySelectorAll<HTMLElement>('.lc-dialog-form .ant-modal')].at(-1)!;
      const fill = (name: string, value: string): void => {
        const input = [...dialog().querySelectorAll<HTMLInputElement>('input')].find((i) => i.id.endsWith('-' + name))!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      const save = (): void => ([...dialog().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save') as HTMLButtonElement).click();
      ([...el.querySelectorAll('main button')].find((b) => b.textContent?.trim() === 'New contact') as HTMLButtonElement).click();
      await until(() => !!document.querySelector('.lc-dialog-form .ant-modal input'), 'dialog');
      expect(dialog().querySelector('h2')?.textContent?.trim()).toBe('New contact');
      fill('name', 'Sara Greco');
      fill('email', 'sara.greco');
      save();
      await until(() => !!dialog().querySelector('.ant-form-item-explain-error'), 'invalid e-mail');
      expect(dialog().querySelector('.ant-form-item-explain-error')?.textContent).toContain('Invalid email address');
      fill('email', 'sara.greco@example.com');
      save();
      await until(() => cells(el, 0, 0).includes('Sara Greco'), 'contact created');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Contact created');
      // Edit: the dialog starts with the data of the row.
      const rows = [...el.querySelectorAll('main nz-table')[0].querySelectorAll('tbody tr')];
      (rows[0].querySelector('.actions button') as HTMLButtonElement).click();
      await until(() => dialog().querySelector('h2')?.textContent?.trim() === 'Edit Anna Conti', 'edit dialog');
      await settle();
      expect([...dialog().querySelectorAll<HTMLInputElement>('input')].find((i) => i.id.endsWith('-email'))?.value).toBe('anna.conti@example.com');
      fill('email', 'anna@example.com');
      save();
      await until(() => cells(el, 0, 1)[0] === 'anna@example.com', 'contact updated');
    });
  });

  describe('standalone fields', () => {
    it('the fields side by side filter the table; the others write to the state that the text shows', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-input');
      await until(() => cells(el, 0, 0).length === 8, 'invoices');
      const row = el.querySelector('main lc-section .body.row') as HTMLElement;
      expect([...row.querySelectorAll('nz-form-label')].map((l) => plainText(l.textContent))).toEqual(['Type', 'Status', 'Customer']);
      // Type: purchase.
      await openSelect(row.querySelector('nz-select')!, settle);
      await until(() => document.querySelectorAll('.ant-select-item-option').length > 0, 'options');
      const options = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
      expect(options.map((o) => plainText(o.textContent))).toEqual(['Sales', 'Purchase']);
      options[1].click();
      await until(() => cells(el, 0, 2).length > 0 && cells(el, 0, 2).every((c) => c === 'Purchase'), 'purchases only');
      // Name and quantity end up in the summary; the switch notifies and unlocks the notes.
      const input = (label: string) => [...el.querySelectorAll('main lc-input')].find((i) => plainText(i.querySelector('nz-form-label')?.textContent) === label) as HTMLElement;
      const nome = input('Name').querySelector('input') as HTMLInputElement;
      nome.value = 'Anna';
      nome.dispatchEvent(new Event('change'));
      await until(() => plainText(el.querySelector('[data-node-id="summary"]')?.textContent) === 'Hello Anna: 1 pieces, delivery —', 'summary');
      const note = input('Reason for urgency (only when urgent)').querySelector('textarea') as HTMLTextAreaElement;
      expect(note.readOnly).toBe(true);
      (input('Urgent').querySelector('nz-switch button') as HTMLButtonElement).click();
      await until(() => !note.readOnly && !!document.querySelector('.ant-message-notice'), 'urgent');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Marked as urgent');
    });
  });

  describe('validation of standalone fields', () => {
    it('«Conferma» checks the group: without a name it stops and says so, with the right data it goes on', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/showcase/showcase-input');
      const button = [...el.querySelectorAll<HTMLButtonElement>('main lc-button button')].find((b) => plainText(b.textContent).startsWith('Confirm'))!;
      button.click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'notice');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Check the highlighted fields');
      expect([...el.querySelectorAll('main .ant-form-item-explain-error')].map((e) => plainText(e.textContent))).toContain('Required field');
      const nome = [...el.querySelectorAll('main lc-input')].find((i) => plainText(i.querySelector('nz-form-label')?.textContent) === 'Name')!.querySelector('input') as HTMLInputElement;
      nome.value = 'Anna';
      nome.dispatchEvent(new Event('change'));
      button.click();
      await until(() => [...document.querySelectorAll('.ant-message-notice')].some((n) => n.textContent?.includes('Data is correct')), 'confirmation');
    });
  });

  describe('tasks and progress', () => {
    it('kanban: «Move» calls the service, reloads and the card changes column or place; lanes, limits, rich cards; timeline and progress', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-tasks');
      const column = (label: string) => [...el.querySelectorAll<HTMLElement>('main lc-kanban section')].find((c) => c.getAttribute('aria-label') === label)!;
      const titles = (label: string) => [...column(label).querySelectorAll('.title')].map((t) => plainText(t.textContent));
      // Two boards on the same tasks: the second one in lanes by person.
      await until(() => el.querySelectorAll('main lc-kanban .card').length === 10, 'cards');
      expect(titles('To do')).toEqual(['Quote for Smith Ltd', 'Contract for Baker Inc']);
      expect([...el.querySelectorAll('main lc-kanban .lane button')].map((b) => plainText(b.textContent))).toEqual(['Anna Rossi 2', 'Luca Bianchi 2', 'Marta Verdi 1']);
      expect(plainText(column('In progress').querySelector('h3')?.textContent)).toBe('In progress 2/2');
      const first = column('To do').querySelector('.card') as HTMLElement;
      expect([plainText(first.querySelector('nz-tag')?.textContent), first.querySelector('.avatar')?.getAttribute('aria-label'), plainText(first.querySelector('.footer')?.textContent)]).toEqual(['high', 'Anna Rossi', 'Points: 3']);
      // Down one place, from the keyboard menu: the service puts it after «Contract for Baker Inc».
      (column('To do').querySelector('.card button') as HTMLButtonElement).click();
      await until(() => document.querySelectorAll('.ant-dropdown-menu-item').length > 0, 'menu');
      ([...document.querySelectorAll<HTMLElement>('.ant-dropdown-menu-item')].find((i) => plainText(i.textContent) === 'Move down') as HTMLElement).click();
      await until(() => titles('To do')[0] === 'Contract for Baker Inc', 'moved down');
      await settle();
      (column('To do').querySelectorAll('.card button')[1] as HTMLButtonElement).click();
      const done = () => [...document.querySelectorAll<HTMLElement>('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item')].find((i) => plainText(i.textContent) === 'Done');
      await until(() => !!done(), 'menu');
      done()!.click();
      await until(() => titles('Done').includes('Quote for Smith Ltd'), 'moved');
      expect(titles('To do')).toEqual(['Contract for Baker Inc']);
      expect(titles('Done')).toEqual(['Order 1001 shipped', 'Quote for Smith Ltd']);
      await until(() => [...document.querySelectorAll('.ant-message-notice')].some((n) => n.textContent?.includes('“Quote for Smith Ltd” moved')), 'notice');
      // Timeline from the most recent, and progress bars.
      await until(() => el.querySelectorAll('main lc-timeline .title').length === 4, 'events');
      expect(plainText(el.querySelector('main lc-timeline .title')?.textContent)).toBe('Order 1001 delivered');
      expect([...el.querySelectorAll('main lc-progress [role="progressbar"]')].map((b) => b.getAttribute('aria-valuenow'))).toEqual(['60', '82', '64']);
      await settle();
    });
  });

  describe('menu', () => {
    it('the menu counters come from the service named by the navigation', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/showcase/showcase-input');
      const leaf = () => [...el.querySelectorAll<HTMLAnchorElement>('lc-sidebar a.leaf')].find((a) => a.getAttribute('href')?.endsWith('/showcase-tasks'));
      await until(() => plainText(leaf()?.querySelector('.badge')?.textContent) === '4', 'counter');
    });
  });

  describe('layout containers', () => {
    it('border with a filter on the west and a table in the center, grid and box with proportions', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/showcase/showcase-containers');
      await until(() => cells(el, 0, 0).length === 8, 'invoices');
      const regions = [...el.querySelectorAll<HTMLElement>('main lc-border .region')];
      expect(regions.map((r) => r.dataset['region'])).toEqual(['north', 'west', 'center', 'east', 'south']);
      expect(regions[2].querySelector('nz-table')).not.toBeNull();
      // The filter on the west writes to the state the table in the center depends on.
      const radios = [...regions[1].querySelectorAll<HTMLElement>('label[nz-radio]')];
      expect(radios.map((r) => plainText(r.textContent))).toEqual(['Draft', 'Sent', 'Paid']);
      (radios[2].querySelector('input') as HTMLInputElement).click();
      await until(() => cells(el, 0, 2).length > 0 && cells(el, 0, 2).every((c) => c === 'Paid'), 'paid only');
      expect([...el.querySelectorAll<HTMLElement>('main lc-grid .grid > lc-node')].map((n) => n.style.getPropertyValue('--lc-span'))).toEqual(['2', '1', '3']);
      expect((el.querySelector('[data-node-id="section-two-thirds"]') as HTMLElement).style.flex).toBe('2 1 0px');
    });
  });

  describe('detail', () => {
    it('fields with a tooltip have the help icon with the translated text', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-layout');
      await until(() => el.querySelectorAll('main lc-detail .help').length === 2, 'help icons');
      expect([...el.querySelectorAll('main lc-detail .help')].map((h) => h.getAttribute('aria-label'))).toEqual([
        'Percentage applied to the order total',
        'Draft, sent to the customer or approved',
      ]);
    });
  });

  describe('dashboard', () => {
    it('the indicators show the values of the summary, formatted and with their captions', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-dashboard');
      const values = (): string[] => [...el.querySelectorAll('main lc-stats .value')].map((v) => plainText(v.textContent));
      await until(() => values().length === 4 && values()[0] !== '…', 'indicators');
      expect(values()).toEqual(['€11,275.00', '€5,975.00', '10', '€2,818.75']);
      expect([...el.querySelectorAll('main lc-stats .caption')].map((c) => plainText(c.textContent))).toEqual(['+12.5% on last month', 'out of 14']);
      // No expression errors while the data arrive.
      await new Promise((r) => setTimeout(r, 0));
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });

    it('charts: bars for two series over twelve months, line, and pie by status translated', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-dashboard');
      const charts = (): Element[] => [...el.querySelectorAll('main lc-chart')];
      await until(() => charts().length === 4 && charts()[0].querySelectorAll('rect.mark').length === 24 && charts()[3].querySelectorAll('path.mark').length === 3, 'charts');
      // Combined: 24 stacked bar pieces (12 columns) and the margin line on the right axis.
      expect(new Set([...charts()[1].querySelectorAll('rect.mark')].map((r) => r.getAttribute('x'))).size).toBe(12);
      expect(charts()[1].querySelectorAll('circle')).toHaveLength(12);
      expect(charts()[1].querySelector('text.axis.right')?.textContent?.trim()).toMatch(/%$/);
      expect([...charts()[1].querySelectorAll('.legend li')].map((li) => li.textContent?.trim())).toEqual(['Sales invoices', 'Purchase invoices', 'Margin (right axis)']);
      expect(charts()[2].querySelectorAll('circle')).toHaveLength(12);
      expect([...charts()[3].querySelectorAll('.legend li')].map((li) => li.textContent?.trim())).toEqual(['Draft', 'Sent', 'Paid']);
      expect(charts()[3].querySelector('text.total')?.textContent?.trim()).toBe('14');
      expect(charts()[0].querySelector('table caption')?.textContent).toContain('Sales and purchase invoices by month');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });

  describe('procedures and views', () => {
    it('step-by-step procedure: the data of the first step reach the summary and the request is sent', async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-views');
      const wizard = el.querySelector('main lc-wizard') as HTMLElement;
      const button = (text: string): HTMLButtonElement | undefined => [...wizard.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
      expect(button('Next')!.disabled).toBe(true);
      const input = wizard.querySelector('input[type="text"]') as HTMLInputElement;
      input.value = 'New monitor';
      input.dispatchEvent(new Event('input'));
      (wizard.querySelectorAll<HTMLInputElement>('input[type="radio"]')[2]).click();
      await settle();
      button('Continue')!.click();
      await until(() => !!wizard.querySelector('section')?.textContent?.includes('Subject: New monitor. Priority: high.'), 'summary');
      button('Next')!.click();
      await until(() => !!button('Send the request'), 'sending step');
      button('Send the request')!.click();
      await until(() => !!wizard.querySelector('nz-alert')?.textContent?.includes('The request “New monitor” has been sent.'), 'outcome');
      expect(button('Next')).toBeUndefined();
      button('New request')!.click();
      await until(() => !!wizard.querySelector('lc-form') && button('Next')?.disabled === true, 'back to the first step, to fill in');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });

    it('tree view: choosing a category updates the state and shows a message', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-views');
      const titles = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('main lc-tree .title')];
      await until(() => titles().some((t) => t.textContent?.trim() === 'IT'), 'tree');
      titles().find((t) => t.textContent?.trim() === 'Maintenance')!.click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Maintenance: 18 expense items');
      await until(() => !!el.querySelector('main')?.textContent?.includes('Chosen code: ser-mnt'), 'state updated');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });

    it('calendar: deadlines of the month with «+n», opening a deadline and next month', async () => {
      const { el, until } = await openShowcase('/showcase/showcase-views');
      const events = (): HTMLButtonElement[] => [...el.querySelectorAll<HTMLButtonElement>('main lc-calendar button.event')];
      await until(() => events().length > 0, 'deadlines');
      // Day 8 has four deadlines: three visible and «+1 altri».
      expect(el.querySelector('main lc-calendar .more')?.textContent?.trim()).toBe('+1 more');
      events().find((b) => b.textContent?.includes('Salaries'))!.click();
      await until(() => !!document.querySelector('.ant-message-notice'), 'message');
      expect(document.querySelector('.ant-message-notice')?.textContent).toContain('Salaries: €1,470.00');
      const title = el.querySelector('main lc-calendar .header h3')?.textContent;
      (el.querySelector('main lc-calendar button[aria-label="Next month"]') as HTMLButtonElement).click();
      await until(() => el.querySelector('main lc-calendar .header h3')?.textContent !== title && events().length > 0, 'next month');
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });

  describe('datatable', () => {
    it('transactions grouped by account, with totals; a status filter and the grouping change the view', { timeout: 20000 }, async () => {
      const { el, until, settle } = await openShowcase('/showcase/showcase-datatable');
      const dt = (): HTMLElement => el.querySelector('main lc-data-table') as HTMLElement;
      const groups = (): string[] => [...dt().querySelectorAll('tr.group-row .group-label')].map((g) => plainText(g.textContent));
      await until(() => groups().length > 0, 'groups');
      expect(plainText(dt().querySelector('.count')?.textContent)).toBe('60 of 60 rows');
      expect(groups()[0]).toMatch(/^Account: Alpha Bank \(\d+\)$/);
      expect(dt().querySelector('tfoot')?.textContent).toContain('Total');
      // Filter: only the transactions to check.
      (([...dt().querySelectorAll<HTMLElement>('th')].find((th) => th.textContent?.trim().startsWith('Status'))!.querySelector('nz-filter-trigger span')) as HTMLElement).click();
      const panel = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.ant-dropdown .filter-panel')].find((p) => p.getAttribute('aria-label') === 'Filter Status');
      await until(() => !!panel(), 'filter');
      const options = [...panel()!.querySelectorAll<HTMLElement>('label[nz-checkbox]')];
      expect(options.map((o) => plainText(o.textContent))).toEqual(['Recorded', 'To check']);
      (options[1].querySelector('input') as HTMLInputElement).click();
      await until(() => plainText(dt().querySelector('.count')?.textContent) !== '60 of 60 rows', 'filtered');
      expect(plainText(dt().querySelector('.count')?.textContent)).toBe('7 of 60 rows');
      document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
      // Grouping: by category too.
      await openSelect(dt().querySelector('.toolbar nz-select')!, settle);
      await until(() => document.querySelectorAll('.ant-select-item-option').length > 0, 'options');
      ([...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => o.textContent?.trim() === 'Category'))!.click();
      await until(() => groups().some((g) => g.startsWith('Category:')), 'two levels');
      // The «Verifica» row action is enabled only for the transactions to check.
      const verify = [...dt().querySelectorAll<HTMLButtonElement>('lc-row-actions .actions > span button')];
      expect(verify.length).toBeGreaterThan(0);
      expect(verify.every((b) => !b.disabled)).toBe(true);
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });

  describe('server-side datatable', () => {
    it('200,000 transactions: groups from the service, opening a group, checking a row with refresh', { timeout: 30000 }, async () => {
      const { el, until } = await openShowcase('/showcase/showcase-datatable');
      const sdt = (): HTMLElement => el.querySelector('main lc-server-data-table') as HTMLElement;
      const groups = (): string[] => [...sdt().querySelectorAll('tr.group-row .group-label')].map((g) => plainText(g.textContent));
      await until(() => groups().length === 4, 'groups');
      expect(plainText(sdt().querySelector('.count')?.textContent)).toBe('4 groups');
      expect(groups()[0]).toBe('Account: Alpha Bank (50,000)');
      (sdt().querySelector('tr.group-row button.toggle') as HTMLButtonElement).click();
      await until(() => sdt().querySelectorAll('tbody tr:not(.group-row):not(.note-row)').length === 15, 'rows of the group');
      expect(sdt().querySelector('tr.note-row button')?.textContent).toContain('49,985');
      // The first row to check in the group: Verifica, then refresh and message.
      const verify = [...sdt().querySelectorAll<HTMLButtonElement>('lc-row-actions .actions > span button')].find((b) => !b.disabled);
      if (verify) {
        verify.click();
        await until(() => !!document.querySelector('.ant-message-notice'), 'message');
        expect(document.querySelector('.ant-message-notice')?.textContent).toContain('checked');
      }
      expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
    });
  });
});
