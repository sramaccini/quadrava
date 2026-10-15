import type { NodeDefinition } from 'schema';
import { plain, renderScreen } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('standalone fields (input)', () => {
  /** A text showing the state, to read what the field wrote. */
  const show = (expression: string): NodeDefinition => ({ id: 'show', type: 'text', text: `{{ ${expression} }}` });
  const shown = (el: HTMLElement): string => plain(el.querySelector('[data-node-id="show"]')?.textContent);
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string, event: 'input' | 'change'): void => {
    input.value = value;
    input.dispatchEvent(new Event(event));
  };

  it('free text is written to the state when leaving the field, not at every character', async () => {
    const h = await renderScreen({
      components: [{ type: 'input', field: { name: 'name', type: 'text', label: 'Name' } }, show("state.name == null ? 'empty' : state.name")],
    });
    expect(plain(h.el.querySelector('lc-input label')?.textContent)).toBe('Name');
    expect(shown(h.el)).toBe('empty');
    const input = h.el.querySelector('lc-input input') as HTMLInputElement;
    type(input, 'Ann', 'input');
    await h.settle();
    expect(shown(h.el)).toBe('empty');
    type(input, 'Anna', 'change');
    await h.settle();
    expect(shown(h.el)).toBe('Anna');
    // Emptied, it goes back to null.
    type(input, '', 'change');
    await h.settle();
    expect(shown(h.el)).toBe('empty');
  });

  it('data sources using the field state reload when it changes; numbers arrive as numbers', async () => {
    const h = await renderScreen({
      components: [{ type: 'input', bind: 'state.filter.quantity', default: 3, field: { name: 'quantity', type: 'number', label: 'Quantity' } }],
      dataSources: { rows: { type: 'rest', method: 'GET', url: '/api/rows', params: { q: '{{ state.filter.quantity }}' } } },
      respond: () => [],
    });
    // The initial value is in the state before the first load.
    await h.until(() => h.requests.length === 1, 'first load');
    expect(h.requests[0].query).toEqual({ q: 3 });
    expect((h.el.querySelector('lc-input input') as HTMLInputElement).value).toBe('3');
    type(h.el.querySelector('lc-input input') as HTMLInputElement, '12', 'change');
    await h.until(() => h.requests.length === 2, 'new load');
    expect(h.requests[1].query).toEqual({ q: 12 });
  });

  it('drop-down list: the choice goes to the state, with the translated labels of the options', async () => {
    const restore = stubViewportHeight();
    try {
      const h = await renderScreen({
        components: [{ type: 'input', field: { name: 'colour', type: 'select', label: 'Colour', options: ['red', 'green'] } }, show("state.colour == null ? 'none' : state.colour")],
      });
      const options = await openSelect(h.el.querySelector('lc-input nz-select')!, h.settle);
      expect(options.map((o) => plain(o.textContent))).toEqual(['red', 'green']);
      options[1].click();
      await h.until(() => shown(h.el) === 'green', 'choice');
    } finally {
      restore();
    }
  });

  it('checkbox and switch start false; onChange sees the new value', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'urgent', type: 'switch', label: 'Urgent' }, onChange: [{ toast: "{{ value ? 'yes' : 'no' }}" }] },
        { type: 'input', field: { name: 'accepted', type: 'checkbox', label: 'I accept' } },
        show('string(state.urgent) + "/" + string(state.accepted)'),
      ],
    });
    expect(shown(h.el)).toBe('false/false');
    // The checkbox has its label beside it, not above.
    expect(h.el.querySelectorAll('lc-input nz-form-label').length).toBe(1);
    (h.el.querySelector('lc-input nz-switch button') as HTMLButtonElement).click();
    await h.until(() => h.toasts.length === 1, 'onChange');
    expect(h.toasts).toEqual(['yes']);
    (h.el.querySelector('lc-input label[nz-checkbox] input') as HTMLInputElement).click();
    await h.until(() => shown(h.el) === 'true/true', 'state');
  });

  it('validation errors appear after the first change; a failing rule makes the field invalid', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'name', type: 'text', label: 'Name', required: true } },
        { type: 'input', field: { name: 'code', type: 'text', label: 'Code', validate: { rule: '{{ value.size() == 3 }}', message: 'Three characters' } } },
        { type: 'input', field: { name: 'broken', type: 'text', label: 'Broken', validate: { rule: '{{ missing.x }}', message: 'Not valid' } } },
      ],
    });
    const [name, code, broken] = [...h.el.querySelectorAll<HTMLInputElement>('lc-input input')];
    expect(h.el.querySelector('.ant-form-item-explain-error')).toBeNull();
    type(name, 'x', 'change');
    type(name, '', 'change');
    type(code, 'ab', 'change');
    type(broken, 'something', 'change');
    await h.until(() => h.el.querySelectorAll('.ant-form-item-explain-error').length === 3, 'errors');
    expect([...h.el.querySelectorAll('.ant-form-item-explain-error')].map((e) => plain(e.textContent))).toEqual(['Campo obbligatorio', 'Three characters', 'Not valid']);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    type(code, 'abc', 'change');
    await h.until(() => h.el.querySelectorAll('.ant-form-item-explain-error').length === 2, 'corrected');
  });

  it('read-only with readOnlyIf (of the node or the field) and disabled with enabledIf', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'active', type: 'switch', label: 'Active' } },
        { type: 'input', readOnlyIf: '{{ !state.active }}', field: { name: 'note', type: 'textarea', label: 'Note' } },
        { type: 'input', field: { name: 'code', type: 'text', label: 'Code', readOnlyIf: '{{ true }}' } },
        { type: 'input', enabledIf: '{{ state.active }}', field: { name: 'data', type: 'date', label: 'Date' } },
      ],
    });
    const textarea = h.el.querySelector('lc-input textarea') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect((h.el.querySelectorAll('lc-input input[nz-input]')[0] as HTMLInputElement).readOnly).toBe(true);
    expect(h.el.querySelector('lc-input nz-date-picker')?.classList).toContain('ant-picker-disabled');
    (h.el.querySelector('lc-input nz-switch button') as HTMLButtonElement).click();
    await h.until(() => !textarea.readOnly, 'editable');
    expect(h.el.querySelector('lc-input nz-date-picker')?.classList).not.toContain('ant-picker-disabled');
  });

  it('a row section puts the fields side by side', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'section',
          layout: 'row',
          components: [
            { type: 'input', field: { name: 'a', type: 'text', label: 'A' } },
            { type: 'input', field: { name: 'b', type: 'text', label: 'B' } },
          ],
        },
      ],
    });
    expect(h.el.querySelector('lc-section .body')?.classList).toContain('row');
    expect(h.el.querySelectorAll('lc-section lc-input').length).toBe(2);
  });

  it('the validate step checks the fields of the group: visible errors and the sequence stopped until they are valid', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', group: 'order', field: { name: 'customer', type: 'text', label: 'Customer', required: true } },
        { type: 'input', group: 'order', field: { name: 'code', type: 'text', label: 'Code', validate: { rule: '{{ value.size() == 3 }}', message: 'Three characters' } } },
        { type: 'input', group: 'other', field: { name: 'remark', type: 'text', label: 'Remark', required: true } },
        { type: 'button', label: 'Send', onClick: [{ validate: 'order' }, { toast: 'sent' }] },
      ],
    });
    const [customer, code] = [...h.el.querySelectorAll<HTMLInputElement>('lc-input input')];
    const send = h.el.querySelector('lc-button button') as HTMLButtonElement;
    send.click();
    await h.until(() => h.toasts.length === 1, 'warning');
    expect(h.toasts).toEqual(['Controlla i campi evidenziati']);
    // Only the field of the group shows the error (code is empty: the rule does not apply to empty fields).
    expect([...h.el.querySelectorAll('.ant-form-item-explain-error')].map((e) => plain(e.textContent))).toEqual(['Campo obbligatorio']);
    type(customer, 'Smith', 'change');
    type(code, 'ab', 'change');
    await h.settle();
    send.click();
    await h.until(() => h.toasts.length === 2, 'second warning');
    type(code, 'abc', 'change');
    await h.settle();
    send.click();
    await h.until(() => h.toasts.at(-1) === 'sent', 'sending');
  });
});
