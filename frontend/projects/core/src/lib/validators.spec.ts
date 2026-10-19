import { TestBed } from '@angular/core/testing';
import { compilePattern, duplicateRows, InvalidValidatorParams, provideValidators, resolveDateLimit, STANDARD_VALIDATORS, ValidatorRegistry, type ValidatorContext, type ValidatorDescriptor } from './validators';

const registry = new ValidatorRegistry();
const context = (values: Record<string, unknown> = {}): ValidatorContext => ({ values, label: (name) => `«${name}»` });
const run = (name: string, value: unknown, params: Record<string, unknown> = {}, values: Record<string, unknown> = {}) => registry.get(name)!.validate(value, params, context(values));

describe('built-in validators', () => {
  it('have unique names', () => {
    const names = STANDARD_VALIDATORS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lengths count Unicode characters and give the limit to the message', () => {
    expect(run('minLength', 'ab', { minLength: 3 })).toEqual({ params: { min: 3 } });
    expect(run('minLength', '😀😀😀', { minLength: 3 })).toBeNull();
    expect(run('maxLength', 'abcd', { maxLength: 3 })).toEqual({ params: { max: 3 } });
  });

  it('pattern matches the whole value, with the u flag', () => {
    expect(run('pattern', 'AB12', { pattern: '[A-Z]{2}\\d{2}' })).toBeNull();
    expect(run('pattern', 'xAB12', { pattern: '[A-Z]{2}\\d{2}' })).not.toBeNull();
    expect(run('pattern', 'AB12x', { pattern: '[A-Z]{2}\\d{2}' })).not.toBeNull();
    expect(run('pattern', 'é', { pattern: '\\p{L}' })).toBeNull();
    expect(run('pattern', 'a|b', { pattern: 'a|b' })).not.toBeNull(); // the alternation is grouped
  });

  it('pattern: too long values do not match; invalid patterns are an error of the definition', () => {
    expect(run('pattern', 'a'.repeat(1001), { pattern: 'a+' })).not.toBeNull();
    expect(() => run('pattern', 'a', { pattern: '(' })).toThrowError(InvalidValidatorParams);
    expect(() => run('pattern', 'a', { pattern: '\\q' })).toThrowError(InvalidValidatorParams); // invalid escape with u
    expect(compilePattern('x'.repeat(501))).toBeNull();
  });

  it('number limits, step from min, decimals and integers', () => {
    expect(run('min', 0, { min: 1 })).toEqual({ params: { min: 1 } });
    expect(run('max', 10, { max: 10 })).toBeNull();
    expect(run('step', 0.3, { step: 0.1 })).toBeNull();
    expect(run('step', 1.5, { step: 1, min: 0.5 })).toBeNull();
    expect(run('step', 1.2, { step: 0.5 })).toEqual({ params: { step: 0.5 } });
    expect(run('decimals', 1.25, { decimals: 2 })).toBeNull();
    expect(run('decimals', 1.255, { decimals: 2 })).toEqual({ params: { decimals: 2 } });
    expect(run('integer', 3, { integer: true })).toBeNull();
    expect(run('integer', 3.5, { integer: true })).toEqual({});
    expect(run('min', Number.NaN, { min: 1 })).not.toBeNull();
  });

  it('invalid limits are an error of the definition', () => {
    expect(() => run('min', 1, { min: '1' })).toThrowError(InvalidValidatorParams);
    expect(() => run('step', 1, { step: 0 })).toThrowError(InvalidValidatorParams);
    expect(() => run('minDate', '2026-01-01', { minDate: 'tomorrow' })).toThrowError(InvalidValidatorParams);
  });

  it('dates: limits inclusive, a day against a day and time compares the day', () => {
    expect(run('minDate', '2026-01-01', { minDate: '2026-01-01' })).toBeNull();
    expect(run('minDate', '2025-12-31', { minDate: '2026-01-01' })).toEqual({ params: { date: '2026-01-01' } });
    expect(run('maxDate', '2026-12-31T18:00', { maxDate: '2026-12-31' })).toBeNull();
    expect(run('maxDate', '2027-01-01T00:00', { maxDate: '2026-12-31' })).not.toBeNull();
  });

  it('across fields: sameAs, after, before with the label of the other field', () => {
    expect(run('sameAs', 'a@b.it', { sameAs: 'email' }, { email: 'a@b.it' })).toBeNull();
    expect(run('sameAs', 'a@b.it', { sameAs: 'email' }, { email: 'x@b.it' })).toEqual({ params: { field: '«email»' } });
    expect(run('after', '2026-02-01', { after: 'start' }, { start: '2026-01-01' })).toBeNull();
    expect(run('after', '2026-01-01', { after: 'start' }, { start: '2026-01-01' })).toEqual({ params: { field: '«start»' } });
    expect(run('after', '2026-01-01', { after: 'start', inclusive: true }, { start: '2026-01-01' })).toBeNull();
    expect(run('after', '2026-01-01', { after: 'start' }, { start: null })).toBeNull(); // nothing to compare yet
    expect(run('before', '2026-01-02', { before: 'end' }, { end: '2026-01-01' })).not.toBeNull();
  });

  it('atLeastOne checks empty values too', () => {
    const atLeastOne = registry.get('atLeastOne')!;
    expect(atLeastOne.checksEmpty).toBe(true);
    expect(run('atLeastOne', null, { atLeastOne: ['phone', 'email'] }, { phone: '', email: null })).toEqual({ params: { fields: '«phone», «email»' } });
    expect(run('atLeastOne', null, { atLeastOne: ['phone', 'email'] }, { phone: '', email: 'a@b.it' })).toBeNull();
  });

  it('unique: repeated cells of a column, ignoring case, spaces at the ends and empty cells', () => {
    const rows = [{ code: 'A1' }, { code: 'b2' }, { code: ' a1 ' }, { code: '' }, { code: '' }];
    expect([...duplicateRows(rows, 'code')]).toEqual([0, 2]);
    expect(run('unique', rows, { unique: 'code' })).toEqual({});
    expect(run('unique', rows.slice(0, 2), { unique: 'code' })).toBeNull();
  });

  it('national formats: an empty country does not pass, an unsupported one is an error of the definition', () => {
    expect(run('taxCode', '12345678Z', { country: 'es' })).toBeNull();
    expect(run('taxCode', '12345678Z', { country: '' })).toEqual({});
    expect(() => run('taxCode', '12345678Z', { country: 'US' })).toThrowError(InvalidValidatorParams);
    expect(run('vatNumber', 'DE136695976', {})).toBeNull(); // the prefix decides
    expect(run('vatNumber', 'DE136695976', { country: null })).toBeNull();
  });

  it('formats give input hints', () => {
    expect(registry.get('email')!.hints).toEqual({ inputMode: 'email', autocomplete: 'email' });
    expect(registry.get('phone')!.hints?.inputMode).toBe('tel');
    expect(registry.get('postalCode')!.hints?.autocomplete).toBe('postal-code');
  });
});

describe('ValidatorRegistry', () => {
  const staffNumber: ValidatorDescriptor = { name: 'staffNumber', appliesTo: ['text'], validate: (value) => (/^S\d{6}$/.test(String(value)) ? null : {}) };

  it('adds validators of the application, which can replace a built-in one', () => {
    const lenientEmail: ValidatorDescriptor = { name: 'email', validate: () => null };
    const custom = new ValidatorRegistry([staffNumber, lenientEmail]);
    expect(custom.get('staffNumber')).toBe(staffNumber);
    expect(custom.check('email', 'not an email')).toBe(true);
    expect(registry.check('email', 'not an email')).toBe(false);
  });

  it('check (isValid in expressions): empty values pass only validators that check them; unknown names throw', () => {
    expect(registry.check('iban', '')).toBe(false);
    expect(registry.check('required', '')).toBe(false);
    expect(registry.check('atLeastOne', 'x', { atLeastOne: ['a'] })).toBe(true);
    expect(registry.check('vatNumber', 'DE136695976', { country: 'DE' })).toBe(true);
    expect(() => registry.check('nope', 'x')).toThrowError('unknown validator nope');
  });

  it('is provided in the root injector with the validators of provideValidators', () => {
    TestBed.configureTestingModule({ providers: [provideValidators(staffNumber)] });
    const fromDi = TestBed.inject(ValidatorRegistry);
    expect(fromDi.check('staffNumber', 'S123456')).toBe(true);
    expect(fromDi.get('iban')).toBeDefined();
  });
});

describe('validators of phases 2 and 3', () => {
  it('minStrength: the estimate counts the personal values of the text fields', () => {
    expect(run('minStrength', 'Xr7$mQ2v!kL9pW', { minStrength: 4 })).toBeNull();
    expect(run('minStrength', 'password1', { minStrength: 1 })).toEqual({ params: { min: 1 } });
    expect(run('minStrength', 'mario.rossi85', { minStrength: 2 })).toBeNull();
    const withPersonal = (personal: string[]) => registry.get('minStrength')!.validate('mario.rossi85', { minStrength: 2 }, { values: {}, label: (n) => n, personal });
    expect(withPersonal(['Mario Rossi'])).not.toBeNull();
    expect(withPersonal([])).toBeNull();
    expect(registry.get('minStrength')!.appliesTo).toEqual(['password']);
  });

  it('minItems and maxItems count the choices', () => {
    expect(run('minItems', ['a'], { minItems: 2 })).toEqual({ params: { min: 2 } });
    expect(run('maxItems', ['a', 'b', 'c'], { maxItems: 2 })).toEqual({ params: { max: 2 } });
    expect(run('maxItems', ['a', 'b'], { maxItems: 2 })).toBeNull();
  });

  it('relative date limits are resolved on the local day', () => {
    const now = new Date(2026, 0, 31, 15, 0);
    expect(resolveDateLimit('today', now)).toBe('2026-01-31');
    expect(resolveDateLimit('today+1d', now)).toBe('2026-02-01');
    expect(resolveDateLimit('today-2w', now)).toBe('2026-01-17');
    expect(resolveDateLimit('today+1m', now)).toBe('2026-02-28'); // the 31st of a shorter month: its last day
    expect(resolveDateLimit('today-18y', now)).toBe('2008-01-31');
    expect(resolveDateLimit('2026-05-01', now)).toBe('2026-05-01');
    expect(resolveDateLimit('tomorrow', now)).toBeNull();
  });

  it('minDate today: yesterday does not pass', () => {
    const today = resolveDateLimit('today')!;
    expect(run('minDate', today, { minDate: 'today' })).toBeNull();
    expect(run('maxDate', '2999-01-01', { maxDate: 'today+30d' })).not.toBeNull();
  });
});
