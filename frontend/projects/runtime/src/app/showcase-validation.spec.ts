import { TestBed } from '@angular/core/testing';
import { DemoDiagnostics } from '../demo/demo-ports';
import { openSelect, stubViewportHeight } from './select-testing';
import { openShowcase, plainText, setupShowcase, teardownShowcase, type Showcase } from './showcase-testing';

/** The validation showcase: flat constraints, national formats, rules across fields, warnings, rows and isValid(). */
describe('Showcase: validation', () => {
  let restoreViewport: () => void;
  beforeAll(() => (restoreViewport = stubViewportHeight()));
  afterAll(() => restoreViewport());
  beforeEach(() => setupShowcase());
  afterEach(() => teardownShowcase());

  const formOf = (s: Showcase, index: number): HTMLElement => s.el.querySelectorAll<HTMLElement>('main lc-form')[index];
  const item = (form: HTMLElement, label: string): HTMLElement =>
    [...form.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plainText(i.querySelector('nz-form-label')?.textContent) === label)!;
  const type = (form: HTMLElement, label: string, value: string): void => {
    const input = item(form, label).querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
  };
  const message = (form: HTMLElement, label: string): string => plainText(item(form, label).querySelector('.ant-form-item-explain')?.textContent);
  const save = async (s: Showcase, form: HTMLElement): Promise<void> => {
    [...form.querySelectorAll<HTMLButtonElement>('button')].find((b) => plainText(b.textContent) === 'Save')!.click();
    await s.settle();
  };
  const toast = (): string => plainText(document.querySelector('.ant-message-notice')?.textContent);

  it('simple constraints: messages after saving, upper case when leaving the field', async () => {
    const s = await openShowcase('/showcase/showcase-validation');
    const form = formOf(s, 0);
    type(form, 'Product code', 'ab');
    type(form, 'Quantity', '2.5');
    type(form, 'Email', 'anna@');
    await save(s, form);
    expect((item(form, 'Product code').querySelector('input') as HTMLInputElement).value).toBe('AB');
    expect(message(form, 'Product code')).toBe('Enter at least 3 characters');
    expect(message(form, 'Quantity')).toBe('Enter a whole number');
    expect(message(form, 'Email')).toBe('Enter a valid email address');
    type(form, 'Product code', 'ab-12');
    type(form, 'Quantity', '3');
    type(form, 'Email', 'anna@example.com');
    await save(s, form);
    await s.until(() => toast().includes('All fields are valid'), 'saved');
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  });

  it('formats by country: the country of another field decides, check digits included', { timeout: 20000 }, async () => {
    const s = await openShowcase('/showcase/showcase-validation');
    const form = formOf(s, 1);
    type(form, 'VAT number', 'IT 00743110158');
    type(form, 'Postal code', '00184');
    type(form, 'Personal tax code', 'tstprv80a41h501e');
    await save(s, form);
    expect(message(form, 'VAT number')).toBe('Enter a valid VAT number');
    expect(message(form, 'Postal code')).toBe('');
    expect(message(form, 'Personal tax code')).toBe('');
    type(form, 'VAT number', 'IT 00743110157');
    await s.settle();
    expect(message(form, 'VAT number')).toBe('');
    // Netherlands: the postal code of Rome is no longer valid.
    await openSelect(item(form, 'Country').querySelector('nz-select')!, s.settle);
    const dutch = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => plainText(o.textContent) === 'Netherlands');
    await s.until(() => !!dutch(), 'options');
    dutch()!.click();
    await s.until(() => message(form, 'Postal code') === 'Enter a valid postal code', 'Dutch postal code');
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  });

  it('rules across fields, conditional required and a warning that does not block', { timeout: 20000 }, async () => {
    const s = await openShowcase('/showcase/showcase-validation');
    const form = formOf(s, 2);
    type(form, 'Email', 'anna@example.com');
    type(form, 'Confirm email', 'anna@example.org');
    type(form, 'Discount %', '30');
    await save(s, form);
    expect(message(form, 'Confirm email')).toBe('Does not match “Email”');
    expect(message(form, 'Phone')).toBe('Fill in at least one of: Phone, Mobile');
    expect(message(form, 'Discount %')).toBe('Above 20% the discount needs a manager’s approval');
    type(form, 'Confirm email', 'anna@example.com');
    type(form, 'Mobile', '+39 333 123 4567');
    await save(s, form);
    await s.until(() => toast().includes('All fields are valid'), 'saved with a warning');
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  });

  it('isValid() in an expression', async () => {
    const s = await openShowcase('/showcase/showcase-validation');
    const result = (): string => plainText(s.el.querySelector('[data-node-id="iban-result"]')?.textContent);
    expect(result()).toBe('Type an IBAN and leave the field.');
    const input = s.el.querySelector('[data-node-id="iban-check"] input') as HTMLInputElement;
    input.value = 'DE89 3704 0044 0532 0130 00';
    input.dispatchEvent(new Event('change'));
    await s.until(() => result().includes('is true'), 'valid IBAN');
    input.value = 'DE89 3704 0044 0532 0130 01';
    input.dispatchEvent(new Event('change'));
    await s.until(() => result().includes('is false'), 'invalid IBAN');
    expect(TestBed.inject(DemoDiagnostics).events()).toEqual([]);
  });
});
