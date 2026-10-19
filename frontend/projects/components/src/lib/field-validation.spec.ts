import { provideValidators } from 'core';
import type { FieldDefinition, NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('declarative validation in the components', () => {
  const type = (input: Element | null, value: string, event: 'input' | 'change' = 'input'): void => {
    (input as HTMLInputElement).value = value;
    input!.dispatchEvent(new Event(event));
  };
  /** The control of a form field, by its label. */
  const item = (h: ScreenHarness, label: string): HTMLElement =>
    [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;
  const input = (h: ScreenHarness, label: string): HTMLInputElement => item(h, label).querySelector('input, textarea') as HTMLInputElement;
  const message = (h: ScreenHarness, label: string): string => plain(item(h, label).querySelector('.ant-form-item-explain')?.textContent);
  const save = async (h: ScreenHarness): Promise<void> => {
    [...h.el.querySelectorAll<HTMLButtonElement>('lc-form button')].find((b) => plain(b.textContent) === 'Save')!.click();
    await h.settle();
  };
  const form = (fields: FieldDefinition[], extra: Record<string, unknown> = {}): NodeDefinition =>
    ({ type: 'form', fields, actions: [{ label: 'Save', onClick: [{ toast: 'saved' }] }], ...extra }) as NodeDefinition;

  it('flat constraints give their translated messages after the first submit, and block it', async () => {
    const h = await renderScreen({
      components: [
        form([
          { name: 'code', type: 'text', label: 'Code', minLength: 3, pattern: '[A-Z0-9]+', messages: { pattern: 'Capitals and digits' } },
          { name: 'qty', type: 'number', label: 'Quantity', min: 1, max: 10 },
          { name: 'mail', type: 'text', label: 'Email', format: 'email' },
        ]),
      ],
    });
    type(input(h, 'Code'), 'ab');
    type(input(h, 'Quantity'), '12');
    type(input(h, 'Email'), 'anna@');
    await h.settle();
    expect(message(h, 'Code')).toBe('');
    await save(h);
    expect(message(h, 'Code')).toBe('Enter at least 3 characters');
    expect(message(h, 'Quantity')).toBe('Enter a value of at most 10');
    expect(message(h, 'Email')).toBe('Enter a valid email address');
    type(input(h, 'Code'), 'abc');
    await h.settle();
    expect(message(h, 'Code')).toBe('Capitals and digits');
    expect(h.toasts).toEqual([]);
  });

  it('a warning is shown but does not block; transform is applied when leaving the field and before sending', async () => {
    const h = await renderScreen({
      components: [form([{ name: 'iban', type: 'text', label: 'IBAN', transform: ['removeSpaces', 'uppercase'], format: 'iban', validation: [{ pattern: 'IT.*', severity: 'warning', message: 'Not an Italian account' }] }], { actions: [{ label: 'Save', onClick: [{ toast: '{{ form.iban }}' }] }] })],
    });
    type(input(h, 'IBAN'), 'de89 3704 0044 0532 0130 00', 'input');
    type(input(h, 'IBAN'), 'de89 3704 0044 0532 0130 00', 'change');
    await h.settle();
    expect(input(h, 'IBAN').value).toBe('DE89370400440532013000');
    await save(h);
    expect(message(h, 'IBAN')).toBe('Not an Italian account');
    expect(item(h, 'IBAN').querySelector('.ant-form-item-has-warning, .ant-form-item-explain-warning')).not.toBeNull();
    expect(h.toasts).toEqual(['DE89370400440532013000']);
  });

  it('rules of the form across fields go to the fields they name', async () => {
    const h = await renderScreen({
      components: [
        form(
          [
            { name: 'email', type: 'text', label: 'Email' },
            { name: 'confirm', type: 'text', label: 'Confirm email' },
            { name: 'phone', type: 'text', label: 'Phone' },
          ],
          { validation: [{ sameAs: 'email', fields: ['confirm'] }, { atLeastOne: ['email', 'phone'] }] },
        ),
      ],
    });
    await save(h);
    expect(message(h, 'Email')).toBe('Fill in at least one of: Email, Phone');
    expect(message(h, 'Phone')).toBe('Fill in at least one of: Email, Phone');
    type(input(h, 'Email'), 'a@b.it');
    type(input(h, 'Confirm email'), 'x@b.it');
    await h.settle();
    expect(message(h, 'Phone')).toBe('');
    expect(message(h, 'Confirm email')).toBe('Does not match “Email”');
  });

  it('a conditional required rule puts the asterisk on the label only while it holds', async () => {
    const h = await renderScreen({
      components: [
        form([
          { name: 'company', type: 'checkbox', label: 'Company' },
          { name: 'vat', type: 'text', label: 'VAT number', validation: [{ required: true, when: '{{form.company == true}}' }, { format: 'vatNumber' }] },
        ]),
      ],
    });
    const star = (): boolean => !!item(h, 'VAT number').querySelector('.ant-form-item-required');
    expect(star()).toBe(false);
    (h.el.querySelector('label[nz-checkbox] input') as HTMLInputElement).click();
    await h.settle();
    expect(star()).toBe(true);
    await save(h);
    expect(message(h, 'VAT number')).toBe('Required field');
  });

  it('a validator of the application, and an unknown one that fails closed and is reported without the value', async () => {
    const h = await renderScreen({
      components: [
        form([
          { name: 'staff', type: 'text', label: 'Staff number', validation: [{ use: 'staffNumber' }] },
          { name: 'other', type: 'text', label: 'Other', validation: [{ use: 'missing' }] },
        ]),
      ],
      extraProviders: [provideValidators({ name: 'staffNumber', messageKey: 'lc.invalid', validate: (v) => (/^S\d{6}$/.test(String(v)) ? null : {}) })],
    });
    type(input(h, 'Staff number'), 'S123456');
    type(input(h, 'Other'), 'private text');
    await save(h);
    expect(message(h, 'Staff number')).toBe('');
    expect(message(h, 'Other')).toBe('Invalid value');
    await h.until(() => h.reports.length > 0, 'report');
    expect(h.reports.map((r) => `${r.source}: ${r.error}`)).toEqual(['validation other.missing: unknown validator']);
    expect(JSON.stringify(h.reports)).not.toContain('private text');
  });

  it('the text box gets the keyboard and autocomplete of the format, numbers their limits', async () => {
    const h = await renderScreen({
      components: [
        form([
          { name: 'mail', type: 'text', label: 'Email', format: 'email' },
          { name: 'zip', type: 'text', label: 'Postal code', format: 'postalCode', country: 'IT' },
          { name: 'qty', type: 'number', label: 'Quantity', min: 0, max: 5, step: 0.5 },
        ]),
      ],
    });
    expect(input(h, 'Email').getAttribute('inputmode')).toBe('email');
    expect(input(h, 'Email').getAttribute('autocomplete')).toBe('email');
    expect(input(h, 'Postal code').getAttribute('autocomplete')).toBe('postal-code');
    expect(['min', 'max', 'step'].map((a) => input(h, 'Quantity').getAttribute(a))).toEqual(['0', '5', '0.5']);
  });

  it('standalone input: errors after the first change, and the validate step', async () => {
    const h = await renderScreen({
      components: [{ type: 'input', field: { name: 'cf', type: 'text', label: 'Tax code', format: 'taxCode', country: 'IT', transform: ['trim', 'uppercase'] } }],
    });
    const box = h.el.querySelector('lc-input input') as HTMLInputElement;
    type(box, ' tstprv80a41h501x ', 'change');
    await h.settle();
    expect(box.value).toBe('TSTPRV80A41H501X');
    expect(plain(h.el.querySelector('lc-input .ant-form-item-explain')?.textContent)).toBe('Enter a valid tax code');
    type(box, 'TSTPRV80A41H501E', 'change');
    await h.settle();
    expect(plain(h.el.querySelector('lc-input .ant-form-item-explain')?.textContent)).toBe('');
  });

  it('filter bar: an invalid value is not searched for; an empty one means all', async () => {
    const h = await renderScreen({
      components: [{ type: 'filterBar', bind: 'state.filters', fields: [{ name: 'zip', type: 'text', label: 'Postal code', format: 'postalCode', country: 'FR' }] }],
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows', params: { zip: '{{ state.filters.zip }}' } } },
      respond: () => [],
    });
    await h.until(() => h.requests.length === 1, 'first load');
    const box = h.el.querySelector('lc-filter-bar input') as HTMLInputElement;
    type(box, '7500', 'change');
    await h.settle();
    expect(plain(h.el.querySelector('lc-filter-bar .ant-form-item-explain')?.textContent)).toBe('Enter a valid postal code');
    expect(h.requests).toHaveLength(1);
    type(box, '75001', 'change');
    await h.until(() => h.requests.length === 2, 'search');
    expect(h.requests[1].query).toEqual({ zip: '75001' });
    expect(plain(h.el.querySelector('lc-filter-bar .ant-form-item-explain')?.textContent)).toBe('');
  });

  it('repeater: unique marks the cells repeated across rows', async () => {
    const h = await renderScreen({
      components: [
        form([{ name: 'lines', type: 'repeater', label: 'Lines', minRows: 2, fields: [{ name: 'code', type: 'text', label: 'Code' }], validation: [{ unique: 'code' }] }]),
      ],
    });
    const cells = [...h.el.querySelectorAll('lc-repeater input')];
    type(cells[0], 'A1');
    type(cells[1], 'a1');
    await save(h);
    expect([...h.el.querySelectorAll('lc-repeater .cell-error')].map((e) => plain(e.textContent))).toEqual(['Repeated in another row', 'Repeated in another row']);
    expect(plain(h.el.querySelector('lc-repeater .summary')?.textContent)).toBe('Some rows repeat the same value');
    expect(h.toasts).toEqual([]);
  });
});
