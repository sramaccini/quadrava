import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';
import { parseIsoDateTime, toIsoDateTime } from './shared';

describe('new field types', () => {
  let restore: () => void;
  beforeAll(() => (restore = stubViewportHeight()));
  afterAll(() => restore());
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

  it('date and time: conversion to local time, round trip', () => {
    const date = parseIsoDateTime('2026-10-07T14:30');
    expect(date?.getHours()).toBe(14);
    expect(toIsoDateTime(date)).toBe('2026-10-07T14:30');
    expect(parseIsoDateTime('2026-10-07')).toBeNull();
    expect(parseIsoDateTime('today')).toBeNull();
  });

  const form: NodeDefinition = {
    type: 'form',
    initial: { when: '2026-10-07T14:30', urgent: false, channels: ['email'] },
    fields: [
      { name: 'note', type: 'textarea', label: 'Note', rows: 6, required: true },
      { name: 'when', type: 'datetime', label: 'When' },
      { name: 'priority', type: 'radio', label: 'Priority', options: ['low', 'high'], optionKey: 'prio' },
      { name: 'urgent', type: 'switch', label: 'Urgent' },
      { name: 'channels', type: 'multiselect', label: 'Channels', options: ['email', 'sms', 'post'], required: true },
    ],
    actions: [{ label: 'Save', onClick: [{ call: 'save' }] }],
  };
  const dataSources = { save: { type: 'rest' as const, method: 'POST' as const, url: '/api/save', body: '{{form}}' } };
  const settleWith = (h: ScreenHarness) => () => h.settle();
  const save = (h: ScreenHarness): void => ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Save')) as HTMLButtonElement).click();

  it('in the form: text area, date and time, radio, switch and multiple selection reach the service', async () => {
    const h = await renderScreen({ components: [form], dataSources });
    const textarea = h.el.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.rows).toBe(6);
    expect((h.el.querySelector('nz-date-picker input') as HTMLInputElement).value).toBe('07/10/2026 14:30');
    textarea.value = 'First line\nSecond line';
    textarea.dispatchEvent(new Event('input'));
    (h.el.querySelectorAll<HTMLInputElement>('nz-radio-group input[type="radio"]')[1]).click();
    (h.el.querySelector('nz-switch button') as HTMLButtonElement).click();
    const options = await openSelect(h.el.querySelector('nz-select') as Element, settleWith(h));
    options.find((o) => plain(o.textContent) === 'sms')!.click();
    await h.settle();
    save(h);
    await h.until(() => h.requests.length === 1, 'saving');
    expect(h.requests[0].body).toEqual({ note: 'First line\nSecond line', when: '2026-10-07T14:30', priority: 'high', urgent: true, channels: ['email', 'sms'] });
  });

  it('required: an empty text area and a multiple selection without values block submitting', async () => {
    const h = await renderScreen({ components: [{ ...form, initial: { channels: [] } } as NodeDefinition], dataSources });
    save(h);
    await h.settle();
    expect(h.el.querySelectorAll('.ant-form-item-explain-error').length).toBe(2);
    expect(h.requests).toEqual([]);
  });

  it('in the filter bar: multiple selection, switch and radio with «Tutti» write to the state', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'filterBar',
          bind: 'state.filters',
          fields: [
            { name: 'states', type: 'multiselect', label: 'States', options: ['draft', 'sent', 'paid'] },
            { name: 'overdue', type: 'switch', label: 'Overdue only' },
            { name: 'kind', type: 'radio', label: 'Kind', options: ['issued', 'received'] },
            { name: 'remark', type: 'textarea', label: 'Remark' },
          ],
        },
      ],
      dataSources: {
        data: { type: 'rest', method: 'GET', url: '/api/data', params: { states: '{{state.filters.states}}', overdue: '{{state.filters.overdue}}', kind: '{{state.filters.kind}}' } },
      },
      respond: () => [],
    });
    expect(h.requests.at(-1)?.query).toEqual({});
    expect(h.el.querySelector('input[type="text"]')).not.toBeNull();
    const options = await openSelect(h.el.querySelector('nz-select') as Element, settleWith(h));
    options.find((o) => plain(o.textContent) === 'draft')!.click();
    options.find((o) => plain(o.textContent) === 'paid')!.click();
    (h.el.querySelector('nz-switch button') as HTMLButtonElement).click();
    const radios = h.el.querySelectorAll<HTMLInputElement>('nz-radio-group input[type="radio"]');
    expect(radios).toHaveLength(3);
    radios[2].click();
    await h.until(() => h.requests.at(-1)?.query?.['kind'] === 'received', 'filters applied');
    expect(h.requests.at(-1)?.query).toEqual({ states: ['draft', 'paid'], overdue: true, kind: 'received' });
    // «Tutti» removes the filter.
    radios[0].click();
    await h.until(() => h.requests.at(-1)?.query?.['kind'] === undefined, 'kind removed');
  });

  it('readOnlyIf really makes text and text area read-only, in the form and in repeatable rows', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'form',
          initial: { rows: [{ item: 'a' }] },
          fields: [
            { name: 'code', type: 'text', label: 'Code', readOnlyIf: '{{ true }}' },
            { name: 'note', type: 'textarea', label: 'Note', readOnlyIf: '{{ true }}' },
            { name: 'free', type: 'text', label: 'Free' },
            { name: 'rows', type: 'repeater', label: 'Rows', readOnlyIf: '{{ true }}', fields: [{ name: 'item', type: 'text', label: 'Item' }] },
          ],
        },
      ],
    });
    const inputs = [...h.el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('lc-form input[nz-input], lc-form textarea[nz-input]')];
    expect(inputs.map((i) => i.readOnly)).toEqual([true, true, false, true]);
  });
});
