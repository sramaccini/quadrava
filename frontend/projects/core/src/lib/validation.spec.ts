import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FieldDefinition } from 'schema';
import { Fakes } from './testing';
import { checkField, checkScreenPatterns, compileRule, fieldRules, formRules, inputHints, isRequired, transformValue, uniqueCellErrors, type ValidationEnv } from './validation';
import { ValidatorRegistry } from './validators';

describe('validation engine', () => {
  let fakes: Fakes;
  let injector: Injector;

  beforeEach(() => {
    fakes = new Fakes();
    injector = TestBed.inject(Injector);
    // Without the catalogue of the components the keys are their own messages: the tests read which message was chosen.
    fakes.i18n.addMessages('en', { 'lc.validation.minLength': 'At least {min}', 'lc.validation.minDate': 'From {date, date}' }, 'builtin');
  });

  function env(values: Record<string, unknown> = {}, extra: Partial<ValidationEnv> = {}): ValidationEnv {
    const runtime = fakes.runtime({ schemaVersion: '1.0', screen: 'v', components: [] }, injector);
    return { runtime, i18n: fakes.i18n, scope: { form: values }, values, label: (name) => name.toUpperCase(), ...extra };
  }

  const check = (field: FieldDefinition, value: unknown, values: Record<string, unknown> = {}) => checkField(field, value, env({ ...values, [field.name]: value }));

  it('compiles the flat constraints first, in a fixed order, then validate and validation', () => {
    const field: FieldDefinition = {
      name: 'code',
      type: 'text',
      validation: [{ format: 'alphanumeric' }],
      validate: { rule: '{{true}}', message: 'x' },
      maxLength: 8,
      required: true,
      minLength: 2,
    };
    expect(fieldRules(field).map((r) => r.name)).toEqual(['required', 'minLength', 'maxLength', 'rule', 'alphanumeric']);
    expect(fieldRules(field)).toBe(fieldRules(field)); // once per definition
  });

  it('compiles keyed rules: the key names the validator, format names the format, use an application validator', () => {
    expect(compileRule({ minLength: 3, message: 'm' })).toEqual({ name: 'minLength', params: { minLength: 3 }, dynamic: false, message: 'm', when: undefined, severity: 'error' });
    expect(compileRule({ format: 'vatNumber', country: '{{form.country}}', severity: 'warning' })).toEqual(
      jasmineLike({ name: 'vatNumber', params: { country: '{{form.country}}' }, dynamic: true, severity: 'warning' }),
    );
    expect(compileRule({ use: 'staffNumber', params: { prefix: 'S' } })).toEqual(jasmineLike({ name: 'staffNumber', params: { prefix: 'S' } }));
    expect(compileRule({ inclusive: true, after: 'start' }).name).toBe('after');
  });

  it('required, with the message of the field', () => {
    expect(check({ name: 'a', type: 'text', required: true }, '')).toEqual({ error: 'lc.required', warning: null });
    expect(check({ name: 'a', type: 'text', required: true, messages: { required: 'Say something' } }, null).error).toBe('Say something');
    // Checkbox and switch are never required by the flat property.
    expect(check({ name: 'a', type: 'checkbox', required: true }, null).error).toBeNull();
  });

  it('other rules pass on an empty field, and give their message with its parameters', () => {
    const field: FieldDefinition = { name: 'a', type: 'text', minLength: 3 };
    expect(check(field, '').error).toBeNull();
    expect(check(field, 'ab').error).toBe('At least 3');
  });

  it('the first error wins; a warning shows only without errors and does not stop the others', () => {
    const field: FieldDefinition = {
      name: 'a',
      type: 'text',
      validation: [{ pattern: '[a-z]+', severity: 'warning', message: 'Lower case is better' }, { maxLength: 3 }, { minLength: 2, message: 'Too short' }],
    };
    expect(check(field, 'ABCD')).toEqual({ error: 'lc.validation.maxLength', warning: null });
    expect(check(field, 'AB')).toEqual({ error: null, warning: 'Lower case is better' });
    expect(check(field, 'A')).toEqual({ error: 'Too short', warning: null });
  });

  it('when: the rule applies only while the condition holds; one that fails keeps it (fail-closed)', () => {
    const field: FieldDefinition = { name: 'vat', type: 'text', validation: [{ required: true, when: '{{form.company == true}}' }] };
    expect(check(field, null, { company: false }).error).toBeNull();
    expect(check(field, null, { company: true }).error).toBe('lc.required');
    const broken: FieldDefinition = { name: 'vat', type: 'text', validation: [{ required: true, when: '{{form.company.nope}}' }] };
    expect(check(broken, null, { company: 1 }).error).toBe('lc.required');
  });

  it('CEL rules see value and form; the old validate rule keeps working', () => {
    const field: FieldDefinition = { name: 'b', type: 'number', validate: { rule: '{{value > form.a}}', message: 'Greater than a' } };
    expect(check(field, 5, { a: 3 }).error).toBeNull();
    expect(check(field, 2, { a: 3 }).error).toBe('Greater than a');
    expect(check({ name: 'b', type: 'text', validation: [{ rule: "{{isValid('iban', value)}}" }] }, 'DE89370400440532013000').error).toBeNull();
  });

  it('parameters with expressions are resolved at every check (a country from another field)', () => {
    const field: FieldDefinition = { name: 'zip', type: 'text', format: 'postalCode', country: '{{form.country}}' };
    expect(check(field, '1012 AB', { country: 'NL' }).error).toBeNull();
    expect(check(field, '1012 AB', { country: 'IT' }).error).toBe('lc.validation.postalCode');
    expect(check(field, '00184', { country: null }).error).toBe('lc.validation.postalCode');
  });

  it('cross-field rules read the values next to the field and the labels of the others', () => {
    const field: FieldDefinition = { name: 'confirm', type: 'text', validation: [{ sameAs: 'email' }] };
    fakes.i18n.addMessages('en', { 'lc.validation.sameAs': 'Must match {field}' }, 'builtin');
    expect(check(field, 'a@b.it', { email: 'x@b.it' }).error).toBe('Must match EMAIL');
  });

  it('formats dates in messages in the active language', () => {
    expect(check({ name: 'd', type: 'date', minDate: '2026-03-04' }, '2026-01-01').error).toBe('From 04/03/2026');
  });

  it('transform applies before the check', () => {
    const field: FieldDefinition = { name: 'iban', type: 'text', format: 'iban', transform: ['removeSpaces', 'uppercase'] };
    expect(transformValue(field, ' de89 3704 0044 0532 0130 00 ')).toBe('DE89370400440532013000');
    expect(transformValue({ name: 'a', type: 'text', transform: ['trim', 'lowercase'] }, '  AbC ')).toBe('abc');
    expect(transformValue(field, 12)).toBe(12);
    expect(check({ name: 'c', type: 'text', maxLength: 3, transform: ['trim'] }, '  abc  ').error).toBeNull();
  });

  describe('fail-closed', () => {
    it('an unknown validator, a wrong field type or bad parameters make the field invalid and are reported once, without the value', async () => {
      const e = env();
      const unknown: FieldDefinition = { name: 'a', type: 'text', validation: [{ use: 'nope' }] };
      expect(checkField(unknown, 'secret-value', e).error).toBe('lc.invalid');
      expect(checkField(unknown, 'secret-value', e).error).toBe('lc.invalid');
      expect(checkField({ name: 'n', type: 'number', validation: [{ minLength: 2 }] }, 3, e).error).toBe('lc.invalid');
      expect(checkField({ name: 'p', type: 'text', pattern: '(' }, 'x', e).error).toBe('lc.invalid');
      expect(checkField({ name: 't', type: 'text', format: 'taxCode', country: 'US' }, 'x', e).error).toBe('lc.invalid');
      await Promise.resolve();
      expect(fakes.reports.map((r) => `${r.source}: ${r.error}`)).toEqual([
        'validation a.nope: unknown validator',
        'validation n.minLength: not for number fields',
        'validation p.pattern: invalid parameters: pattern does not compile',
        'validation t.taxCode: invalid parameters: country not supported by taxCode',
      ]);
      expect(JSON.stringify(fakes.reports)).not.toContain('secret-value');
    });

    it('a CEL rule that cannot be evaluated does not pass', () => {
      expect(check({ name: 'a', type: 'text', validation: [{ rule: '{{value.nope > 1}}' }] }, 'x').error).toBe('lc.invalid');
    });
  });

  it('validators of the application, registered in the runtime', () => {
    const registry = new ValidatorRegistry([{ name: 'staffNumber', appliesTo: ['text'], validate: (v) => (/^S\d{6}$/.test(String(v)) ? null : {}) }]);
    fakes.deps.validators = registry;
    const field: FieldDefinition = { name: 's', type: 'text', validation: [{ use: 'staffNumber', message: 'S and six digits' }] };
    expect(check(field, 'S123456').error).toBeNull();
    expect(check(field, 'X1').error).toBe('S and six digits');
  });

  it('form rules by the field they check; atLeastOne by its own fields', () => {
    const rules = formRules([{ after: 'start', fields: ['end'] }, { atLeastOne: ['phone', 'email'] }]);
    expect([...rules.keys()]).toEqual(['end', 'phone', 'email']);
    const e = env({ start: '2026-02-01', end: '2026-01-01' });
    expect(checkField({ name: 'end', type: 'date' }, '2026-01-01', e, rules.get('end')).error).toBe('lc.validation.after');
  });

  it('isRequired follows required and the conditional required rules', () => {
    const field: FieldDefinition = { name: 'vat', type: 'text', validation: [{ required: true, when: '{{form.company}}' }] };
    expect(isRequired(field, env({ company: true }))).toBe(true);
    expect(isRequired(field, env({ company: false }))).toBe(false);
    expect(isRequired({ name: 'x', type: 'text', required: true }, env())).toBe(true);
  });

  it('input hints come from the format', () => {
    const registry = new ValidatorRegistry();
    expect(inputHints({ name: 'e', type: 'text', format: 'email' }, registry)).toEqual({ inputMode: 'email', autocomplete: 'email' });
    expect(inputHints({ name: 'e', type: 'text', validation: [{ format: 'phone' }] }, registry).inputMode).toBe('tel');
    expect(inputHints({ name: 'e', type: 'text' }, registry)).toEqual({});
  });

  it('unique marks the repeated cells of a repeater', () => {
    const field: FieldDefinition = { name: 'lines', type: 'repeater', fields: [{ name: 'code', type: 'text' }], validation: [{ unique: 'code' }] };
    const rows = [{ code: 'A' }, { code: 'B' }, { code: 'a' }];
    expect(checkField(field, rows, env()).error).toBe('lc.validation.unique');
    expect(uniqueCellErrors(field, rows, env())).toEqual(
      new Map([
        [0, { code: 'lc.validation.uniqueCell' }],
        [2, { code: 'lc.validation.uniqueCell' }],
      ]),
    );
  });
});

/** Partial match of an object (the properties not listed are not compared). */
function jasmineLike(expected: Record<string, unknown>): unknown {
  return expect.objectContaining(expected);
}

describe('checkScreenPatterns', () => {
  it('reports the patterns of fields and rules that do not compile, with their path', () => {
    const screen = {
      components: [{ type: 'form', fields: [{ name: 'a', type: 'text', pattern: '[A-Z]+', messages: { pattern: 'Capitals (A-Z' } }, { name: 'b', type: 'text', pattern: '(', validation: [{ pattern: '\\q' }] }] }],
    };
    expect(checkScreenPatterns(screen).map((i) => i.path)).toEqual(['/components/0/fields/1/pattern', '/components/0/fields/1/validation/0/pattern']);
  });
});

describe('malformed definitions (being written in the editor)', () => {
  it('give no rules or fail closed, never throw', () => {
    expect(fieldRules('text' as unknown as FieldDefinition)).toEqual([]);
    expect(fieldRules({ name: 'a', type: 'text', validation: 'x' } as unknown as FieldDefinition)).toEqual([]);
    expect(fieldRules({ name: 'a', type: 'text', validation: [null] } as unknown as FieldDefinition).map((r) => r.name)).toEqual(['unknown']);
    expect(formRules('x' as never).size).toBe(0);
    expect(formRules([null, { sameAs: 'a', fields: 'b' }] as never).size).toBe(0);
    expect(transformValue({ name: 'a', type: 'text', transform: 'trim' } as unknown as FieldDefinition, ' a ')).toBe(' a ');
  });
});
