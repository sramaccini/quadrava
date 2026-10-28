import { TestBed } from '@angular/core/testing';
import { I18n } from 'core';
import { EDITOR_MESSAGES } from '../messages';
import type { Json } from './doc-ops';
import { EditorStore } from './editor-store';
import { expressionHints } from './expression-help';
import { definitionProperties, listItem, nodeProperties, type PropertyInfo, type Variant } from './schema-info';
import { defaultItem, summaryOf } from './templates';
import { documentProviders } from './workspace';

const t = (key: string): string => EDITOR_MESSAGES['en'][key] ?? key;
const variantsOf = (info: PropertyInfo): Variant[] => {
  const shape = listItem(info);
  return shape && 'variants' in shape ? shape.variants : [];
};

describe('editing validation', () => {
  const fieldProps = definitionProperties('field');
  const fieldRules = variantsOf(fieldProps.find((p) => p.name === 'validation')!);
  const formRules = variantsOf(nodeProperties('form').find((p) => p.name === 'validation')!);

  it('the flat constraints are properties of the field, edited like the others', () => {
    const kind = (name: string) => fieldProps.find((p) => p.name === name)?.kind;
    expect(['minLength', 'maxLength', 'min', 'max', 'step', 'decimals'].map(kind)).toEqual(Array(6).fill('number'));
    expect(['pattern', 'country', 'minDate', 'maxDate'].map(kind)).toEqual(Array(4).fill('text'));
    expect(kind('format')).toBe('enum');
    expect(kind('integer')).toBe('boolean');
    expect(kind('messages')).toBe('object');
  });

  it('the rules of fields and forms are variants recognised by their key, each with a label in both languages', () => {
    const keys = ['required', 'minLength', 'maxLength', 'pattern', 'format', 'min', 'max', 'step', 'decimals', 'integer', 'minDate', 'maxDate', 'minStrength', 'minItems', 'maxItems', 'sameAs', 'after', 'before', 'atLeastOne', 'unique', 'rule', 'use'];
    // Remote rules check one field: only in the rules of fields.
    expect(fieldRules.map((v) => v.key)).toEqual([...keys, 'remote']);
    expect(formRules.map((v) => v.key)).toEqual(keys);
    for (const key of [...keys, 'remote']) {
      expect(EDITOR_MESSAGES['en'][`ed.variant.${key}`], key).toBeTruthy();
      expect(EDITOR_MESSAGES['it'][`ed.variant.${key}`], key).toBeTruthy();
    }
    const format = fieldRules.find((v) => v.key === 'format')!;
    expect(format.fields.map((f) => f.name)).toEqual(['format', 'country', 'message', 'when', 'severity']);
  });

  it('a new rule starts from its key with a value of the right kind; form rules name their fields', () => {
    const item = (variants: Variant[], key: string) => defaultItem(variants.find((v) => v.key === key)!.fields, 0, t);
    expect(item(fieldRules, 'format')).toEqual({ format: 'email' });
    expect(item(fieldRules, 'required')).toEqual({ required: true });
    expect(item(fieldRules, 'rule')).toEqual({ rule: '{{ value != null }}' });
    expect(item(fieldRules, 'atLeastOne')).toEqual({ atLeastOne: [] });
    expect(item(formRules, 'after')).toEqual({ after: '', fields: [] });
  });

  it('a closed rule is summed up by its key and value', () => {
    expect(summaryOf({ maxLength: 50 }, 'maxLength')).toBe('maxLength: 50');
    expect(summaryOf({ format: 'iban' }, 'format')).toBe('format: iban');
    expect(summaryOf({ atLeastOne: ['phone', 'email'] }, 'atLeastOne')).toBe('atLeastOne: phone, email');
  });

  it('expressions of the rules see value, form and isValid', () => {
    const doc: Json = {
      components: [{ type: 'form', fields: [{ name: 'vat', type: 'text', validation: [{ rule: '{{ true }}' }] }, { name: 'country', type: 'text' }], validation: [{ rule: '{{ true }}', fields: ['vat'] }] }],
    };
    const hints = (path: (string | number)[]) => expressionHints(doc, path).map((h) => h.label);
    expect(hints(['components', 0, 'fields', 0, 'validation', 0, 'rule'])).toEqual(expect.arrayContaining(['value', 'form.vat', 'form.country', "isValid('iban', …)"]));
    expect(hints(['components', 0, 'validation', 0, 'rule'])).toEqual(expect.arrayContaining(['form.vat', 'form.country']));
  });

  it('the rules of a standalone field see the fields of its validation group in form', () => {
    const doc: Json = {
      components: [
        { type: 'input', group: 'contact', field: { name: 'email', type: 'text' } },
        { type: 'box', components: [{ type: 'input', group: 'contact', field: { name: 'confirm', type: 'text', validation: [{ rule: '{{ true }}' }] } }] },
        { type: 'input', field: { name: 'other', type: 'text' } },
      ],
    };
    const labels = expressionHints(doc, ['components', 1, 'components', 0, 'field', 'validation', 0, 'rule']).map((h) => h.label);
    expect(labels).toEqual(expect.arrayContaining(['value', 'form.email', 'form.confirm']));
    expect(labels).not.toContain('form.other');
  });

  describe('issues', () => {
    let store: EditorStore;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: documentProviders('screen', 'd1') });
      TestBed.inject(I18n).addMessages('en', EDITOR_MESSAGES['en']);
      store = TestBed.inject(EditorStore);
    });

    it('a remote rule names a data source of the screen', () => {
      store.load({
        schemaVersion: '1.0',
        screen: 'v',
        dataSources: { checkStaff: { ref: 'staff/check' } },
        components: [{ type: 'form', fields: [{ name: 'a', type: 'text', validation: [{ remote: 'checkStaff' }] }, { name: 'b', type: 'text', validation: [{ remote: 'nope' }] }] }],
      });
      expect(store.issues().map((i) => `${i.severity} ${i.pointer}`)).toEqual(['warning /components/0/fields/1/validation/0/remote']);
      expect(store.suggestions('remote')).toEqual(['checkStaff']);
    });

    it('a pattern that does not compile, and a constraint on the wrong field type, are reported on the field', () => {
      store.load({
        schemaVersion: '1.0',
        screen: 'v',
        components: [{ type: 'form', fields: [{ name: 'code', type: 'text', pattern: '(' }, { name: 'qty', type: 'number', maxLength: 3 }] }],
      });
      const pointers = store.issues().map((i) => i.pointer);
      expect(pointers).toContain('/components/0/fields/0/pattern');
      expect(pointers.some((p) => p.startsWith('/components/0/fields/1'))).toBe(true);
    });
  });
});
