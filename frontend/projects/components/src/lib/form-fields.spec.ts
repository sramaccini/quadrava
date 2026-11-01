import type { DataRequest } from 'core';
import type { FieldDefinition, NodeDefinition } from 'schema';
import { dataItems, itemValue, MAX_DATA_FIELDS, withItemValue } from './form-fields';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('form fields from a data source', () => {
  describe('dataItems', () => {
    const from = { source: 'fields', into: 'custom', nameField: 'key' };

    it('one field per row, in order, with the label and options of the row as data', () => {
      const items = dataItems(
        [
          { key: 'customer', label: 'Customer {{ user.email }}', type: 'text', required: true },
          { key: 'severity', label: 'Severity', type: 'select', options: [{ value: 1, label: 'Low' }, { value: 'high', label: 'High' }, 'plain'] },
        ],
        from,
      );
      expect(items.map((i) => i.key)).toEqual(['custom.customer', 'custom.severity']);
      expect(items[0].label).toBe('Customer {{ user.email }}');
      expect(items[0].field).toEqual({ name: 'customer', type: 'text', required: true });
      expect(items[1].field.options).toEqual(['1', 'high', 'plain']);
      expect(items[1].optionLabels).toEqual({ '1': 'Low', high: 'High', plain: 'plain' });
    });

    it('leaves out rows without a valid name, repeated names, unknown types; at most 50', () => {
      const rows = [{ key: '1bad', type: 'text' }, { key: 'ok', type: 'text' }, { key: 'ok', type: 'number' }, { key: 'file', type: 'file' }, { key: 'who', type: 'user' }, null, 'x'];
      expect(dataItems(rows, from).map((i) => i.field.name)).toEqual(['ok']);
      const many = Array.from({ length: 60 }, (_, i) => ({ key: `f${i}`, type: 'text' }));
      expect(dataItems(many, from)).toHaveLength(MAX_DATA_FIELDS);
      expect(dataItems({ not: 'a list' }, from)).toEqual([]);
    });

    it('without an object the names of the screen fields are taken', () => {
      expect(dataItems([{ name: 'title', type: 'text' }, { name: 'extra', type: 'text' }], { source: 'fields' }, new Set(['title'])).map((i) => i.key)).toEqual(['extra']);
      expect(dataItems([{ name: 'title', type: 'text' }], { source: 'fields', into: 'custom' }, new Set(['title'])).map((i) => i.key)).toEqual(['custom.title']);
    });

    it('a model gives the control and its rules; the row replaces name, label, options and required', () => {
      const user: FieldDefinition = { name: 'user', type: 'lookup', label: 'Not used', lookup: { source: 'members', labelField: 'name' }, readOnlyIf: '{{ !can("x.y.z") }}' };
      const text: FieldDefinition = { name: 'text', type: 'text', maxLength: 1000 };
      const choice: FieldDefinition = { name: 'choice', type: 'select', options: ['a', 'b'], optionKey: 'values.choice' };
      const [owner, note, pick, picked] = dataItems(
        [
          { name: 'owner', type: 'user', label: 'Owner', required: true },
          { name: 'note', type: 'text' },
          { name: 'pick', type: 'choice' },
          { name: 'picked', type: 'choice', options: ['c'] },
        ],
        { source: 'fields', types: { user, text, choice } },
      );
      expect(owner.field).toEqual({ name: 'owner', type: 'lookup', label: 'Not used', lookup: { source: 'members', labelField: 'name' }, readOnlyIf: '{{ !can("x.y.z") }}', required: true });
      expect(owner.label).toBe('Owner');
      expect(note.field).toEqual({ name: 'note', type: 'text', maxLength: 1000 });
      expect(note.label).toBe('note');
      // Options of the model, translated by the screen; options of the row, which are data.
      expect([pick.field.options, pick.field.optionKey, pick.optionLabels]).toEqual([['a', 'b'], 'values.choice', null]);
      expect([picked.field.options, picked.field.optionKey, picked.optionLabels]).toEqual([['c'], undefined, { c: 'c' }]);
    });

    it('values kept in the object, or next to the others', () => {
      const [item] = dataItems([{ key: 'customer', type: 'text' }], from);
      const values = withItemValue({ title: 'x', custom: { other: 1 } }, item, 'custom', 'ACME');
      expect(values).toEqual({ title: 'x', custom: { other: 1, customer: 'ACME' } });
      expect(itemValue(values, item, 'custom')).toBe('ACME');
      expect(itemValue({ custom: null }, item, 'custom')).toBeUndefined();
      const [flat] = dataItems([{ name: 'extra', type: 'text' }], { source: 'fields' });
      expect(withItemValue({ title: 'x' }, flat, undefined, 'y')).toEqual({ title: 'x', extra: 'y' });
    });
  });

  describe('in a form', () => {
    const definitions = [
      { key: 'customer', label: 'Customer', type: 'text', required: true },
      { key: 'severity', label: 'Severity', type: 'select', options: [{ value: '1', label: 'Low' }, { value: '2', label: 'High' }] },
      { key: 'due', label: 'Due', type: 'date' },
    ];
    const form: NodeDefinition = {
      type: 'form',
      source: 'issue',
      fields: [{ name: 'title', type: 'text', label: 'Title', required: true }],
      fieldsFrom: { source: 'fields', into: 'custom', nameField: 'key' },
      actions: [{ label: 'Save', onClick: [{ call: 'save' }, { toast: 'saved' }] }],
    };
    const dataSources = {
      issue: { type: 'rest' as const, method: 'GET' as const, url: '/api/issue' },
      fields: { type: 'rest' as const, method: 'GET' as const, url: '/api/fields' },
      save: { type: 'rest' as const, method: 'PUT' as const, url: '/api/issue', body: '{{ form }}' },
    };
    const item = (h: ScreenHarness, label: string): HTMLElement | undefined =>
      [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label);
    const labels = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('nz-form-label')].map((l) => plain(l.textContent));
    const message = (h: ScreenHarness, label: string): string => plain(item(h, label)?.querySelector('.ant-form-item-explain')?.textContent);
    const type = (h: ScreenHarness, label: string, value: string): void => {
      const input = item(h, label)!.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
    };
    const save = (h: ScreenHarness): void => [...h.el.querySelectorAll<HTMLButtonElement>('lc-form button')].find((b) => plain(b.textContent) === 'Save')!.click();

    it('shows the fields of the data after those of the screen, with the values of the object', async () => {
      const h = await renderScreen({
        components: [form],
        dataSources,
        respond: (r) => (r.url === '/api/fields' ? definitions : { title: 'Broken login', custom: { customer: 'ACME', severity: '2' } }),
      });
      await h.until(() => labels(h).length === 4, 'data fields');
      expect(labels(h)).toEqual(['Title', 'Customer', 'Severity', 'Due']);
      expect((item(h, 'Customer')!.querySelector('input') as HTMLInputElement).value).toBe('ACME');
      expect(plain(item(h, 'Severity')!.querySelector('nz-select')?.textContent)).toBe('High');
      expect(item(h, 'Customer')!.querySelector('nz-form-label label')?.classList.contains('ant-form-item-required')).toBe(true);
      expect(h.reports).toEqual([]);
    });

    it('checks the data fields too, and sends their values in the object', async () => {
      const h = await renderScreen({ components: [form], dataSources, respond: (r) => (r.url === '/api/fields' ? definitions : r.method === 'PUT' ? {} : { title: 'T', custom: {} }) });
      await h.until(() => labels(h).length === 4, 'data fields');
      save(h);
      await h.until(() => message(h, 'Customer') !== '', 'required data field');
      expect(h.requests.some((r) => r.method === 'PUT')).toBe(false);
      type(h, 'Customer', 'ACME');
      save(h);
      await h.until(() => h.toasts.includes('saved'), 'saved');
      const sent = h.requests.find((r) => r.method === 'PUT') as DataRequest;
      expect(sent.body).toEqual({ title: 'T', custom: { customer: 'ACME' } });
    });

    it('the field errors of the service on the object go to the data fields; what the user typed stays', async () => {
      let refused = false;
      const h = await renderScreen({
        components: [form],
        dataSources,
        respond: (r) => {
          if (r.url === '/api/fields') return definitions;
          if (r.method === 'PUT' && !refused) {
            refused = true;
            throw Object.assign(new Error('422'), { status: 422, fieldErrors: [{ path: '/custom/customer', code: 'email' }] });
          }
          return r.method === 'PUT' ? {} : { title: 'T', custom: { customer: 'x' } };
        },
      });
      await h.until(() => labels(h).length === 4, 'data fields');
      type(h, 'Customer', 'typed by the user');
      save(h);
      await h.until(() => message(h, 'Customer') !== '', 'field error of the service');
      expect(message(h, 'Customer')).toBe('Enter a valid email address');
      // The call changed the state of the sources, not the data of the form: the second attempt sends the same values.
      save(h);
      await h.until(() => h.toasts.includes('saved'), 'saved');
      expect(h.requests.filter((r) => r.method === 'PUT').map((r) => (r.body as { custom: unknown }).custom)).toEqual([{ customer: 'typed by the user' }, { customer: 'typed by the user' }]);
    });

    it('the actions wait for the fields of the data', async () => {
      let release: (rows: unknown) => void = () => undefined;
      const pending = new Promise((resolve) => (release = resolve));
      const h = await renderScreen({ components: [form], dataSources, respond: (r) => (r.url === '/api/fields' ? pending : { title: 'T' }) });
      const button = [...h.el.querySelectorAll<HTMLButtonElement>('lc-form button')].find((b) => plain(b.textContent) === 'Save')!;
      expect(button.disabled).toBe(true);
      release(definitions);
      await h.until(() => !button.disabled, 'fields loaded');
    });

    it('a failure of the source of the fields is shown, the fields of the screen stay', async () => {
      const failed = await renderScreen({
        components: [form],
        dataSources,
        respond: (r) => {
          if (r.url === '/api/fields') throw Object.assign(new Error('boom'), { status: 500 });
          return { title: 'T' };
        },
      });
      await failed.until(() => failed.el.querySelector('lc-form [role="alert"]') !== null, 'failure shown');
      expect(labels(failed)).toEqual(['Title']);
    });
  });
});
