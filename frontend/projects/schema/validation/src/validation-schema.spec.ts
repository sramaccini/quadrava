import { validateScreen } from './validate';

const form = (fields: unknown[], extra: Record<string, unknown> = {}) => ({
  schemaVersion: '1.0',
  screen: 'validation',
  components: [{ type: 'form', fields, ...extra }],
});

function issuesOf(doc: unknown): string[] {
  const result = validateScreen(doc);
  return result.valid ? [] : result.issues.map((i) => i.path);
}

describe('validation in the screen schema', () => {
  it('accepts the flat constraints of every field type', () => {
    const doc = form([
      { name: 'code', type: 'text', minLength: 2, maxLength: 10, pattern: '[A-Z]+', transform: ['trim', 'uppercase'], messages: { pattern: 'Capitals only' } },
      { name: 'vat', type: 'text', format: 'vatNumber' },
      { name: 'zip', type: 'text', format: 'postalCode', country: '{{form.country}}' },
      { name: 'notes', type: 'richtext', maxLength: 2000 },
      { name: 'qty', type: 'number', min: 1, max: 99, step: 0.5, decimals: 1, integer: false },
      { name: 'day', type: 'date', minDate: '2026-01-01', maxDate: '2026-12-31T18:00' },
    ]);
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rejects a constraint on a field type it does not apply to', () => {
    expect(issuesOf(form([{ name: 'a', type: 'text', min: 1 }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'number', maxLength: 3 }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'select', format: 'email' }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'text', minDate: '2026-01-01' }])).length).toBeGreaterThan(0);
  });

  it('requires a country for the national formats except vatNumber', () => {
    expect(issuesOf(form([{ name: 'a', type: 'text', format: 'taxCode' }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'text', format: 'taxCode', country: 'IT' }]))).toEqual([]);
    expect(issuesOf(form([{ name: 'a', type: 'text', format: 'postalCode', country: 'italy' }])).length).toBeGreaterThan(0);
  });

  it('accepts the rules of a field, each named by its key', () => {
    const doc = form([
      {
        name: 'vat',
        type: 'text',
        validation: [
          { required: true, when: '{{form.company == true}}' },
          { format: 'vatNumber', country: 'DE', message: 'Not a German VAT number' },
          { pattern: '^IT', severity: 'warning' },
          { rule: '{{value != form.other}}' },
          { use: 'staffNumber', params: { prefix: 'S' } },
        ],
      },
    ]);
    expect(issuesOf(doc)).toEqual([]);
  });

  it('rejects a rule with two keys, an unknown key or targets on a field', () => {
    expect(issuesOf(form([{ name: 'a', type: 'text', validation: [{ minLength: 1, maxLength: 3 }] }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'text', validation: [{ length: 3 }] }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'text', validation: [{ sameAs: 'b', fields: ['a'] }] }])).length).toBeGreaterThan(0);
  });

  it('accepts the rules of a form across its fields', () => {
    const doc = form([{ name: 'start', type: 'date' }, { name: 'end', type: 'date' }], {
      validation: [{ after: 'start', fields: ['end'], inclusive: true }, { atLeastOne: ['start', 'end'] }, { rule: '{{form.start != null}}', fields: ['start'], severity: 'warning' }],
    });
    expect(issuesOf(doc)).toEqual([]);
  });

  it('password fields, relative dates, limits of a multiple choice and remote rules', () => {
    const doc = form([
      { name: 'pw', type: 'password', newPassword: true, minStrength: 3, minLength: 10, pattern: '.*\\d.*', messages: { minStrength: 'Stronger' } },
      { name: 'birth', type: 'date', maxDate: 'today-18y', minDate: '1900-01-01' },
      { name: 'meeting', type: 'datetime', minDate: 'today', maxDate: 'today+6m' },
      { name: 'tags', type: 'multiselect', options: ['a', 'b', 'c'], minItems: 1, maxItems: 2 },
      { name: 'staff', type: 'text', validation: [{ remote: 'checkStaff', debounce: 300, message: 'Taken' }, { minStrength: 2 }] },
    ]);
    expect(issuesOf(doc)).toEqual([]);
    expect(issuesOf(form([{ name: 'a', type: 'text', newPassword: true }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'select', options: ['x'], minItems: 1 }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'date', minDate: 'tomorrow' }])).length).toBeGreaterThan(0);
    expect(issuesOf(form([{ name: 'a', type: 'password', format: 'email' }])).length).toBeGreaterThan(0);
    // Remote rules check one field: not across fields.
    expect(issuesOf(form([{ name: 'a', type: 'text' }], { validation: [{ remote: 'x', fields: ['a'] }] })).length).toBeGreaterThan(0);
  });

  it('a form rule must name the fields it checks, except atLeastOne', () => {
    expect(issuesOf(form([{ name: 'a', type: 'date' }], { validation: [{ after: 'a' }] })).length).toBeGreaterThan(0);
  });

  it('points at the wrong properties of a rule, shared ones (message, severity, fields) included', () => {
    const paths = (doc: unknown) => [...new Set(issuesOf(doc))].sort();
    expect(paths(form([{ name: 'a', type: 'text', validation: [{ minLength: -1, severity: 'fatal', extra: 1 }] }]))).toEqual([
      '/components/0/fields/0/validation/0',
      '/components/0/fields/0/validation/0/minLength',
      '/components/0/fields/0/validation/0/severity',
    ]);
    expect(paths(form([{ name: 'a', type: 'date' }], { validation: [{ after: 'a', fields: [], message: 3 }] }))).toEqual([
      '/components/0/validation/0',
      '/components/0/validation/0/fields',
      '/components/0/validation/0/message',
    ]);
  });
});
