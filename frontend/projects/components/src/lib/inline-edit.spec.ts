import type { DataRequest } from 'core';
import type { FieldDefinition, NodeDefinition } from 'schema';
import { inlineText, isEmptyValue, sameValue } from './inline-edit';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('inline editing in the form', () => {
  const labels = { yes: 'Yes', no: 'No', translate: (key: string, fallback: string) => (key === 'status.open' ? 'Open' : fallback) };

  describe('pure functions', () => {
    it('the text of a value: options translated, data labels, dates, lists', () => {
      const select: FieldDefinition = { name: 'status', type: 'select', optionKey: 'status' };
      expect(inlineText(select, 'open', 'en-GB', labels, null)).toBe('Open');
      expect(inlineText(select, 'open', 'en-GB', labels, { open: 'From the data' })).toBe('From the data');
      expect(inlineText({ name: 'due', type: 'date' }, '2026-11-26', 'en-GB', labels, null)).toBe('26/11/2026');
      expect(inlineText({ name: 'tags', type: 'tags' }, ['a', 'b'], 'en-GB', labels, null)).toBe('a, b');
      expect(inlineText({ name: 'title', type: 'text' }, '', 'en-GB', labels, null)).toBe('');
    });

    it('empty and unchanged values', () => {
      expect([null, undefined, '', '  ', []].every(isEmptyValue)).toBe(true);
      expect(isEmptyValue(0)).toBe(false);
      expect(sameValue(null, '')).toBe(true);
      expect(sameValue('a', 'a')).toBe(true);
      expect(sameValue(['a'], ['a', 'b'])).toBe(false);
    });
  });

  const form: NodeDefinition = {
    type: 'form',
    id: 'content',
    source: 'issue',
    edit: 'inline',
    fields: [
      { name: 'summary', type: 'text', label: 'Summary', display: 'heading', required: true, maxLength: 20 },
      { name: 'description', type: 'textarea', label: 'Description', emptyText: 'Add a description…' },
      { name: 'key', type: 'text', label: 'Key', readOnlyIf: '{{ true }}' },
    ],
    onSave: [{ call: 'patch' }, { toast: "{{ 'saved ' + field + '=' + string(value) }}" }],
  };
  const dataSources = {
    issue: { type: 'rest' as const, method: 'GET' as const, url: '/api/issue' },
    patch: { type: 'rest' as const, method: 'PATCH' as const, url: '/api/issue', body: '{{ {field: value} }}' },
  };
  const item = (h: ScreenHarness, label: string): HTMLElement =>
    [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;
  const view = (h: ScreenHarness, label: string): HTMLElement | null => item(h, label).querySelector<HTMLElement>('.view');
  const button = (h: ScreenHarness, label: string, name: string): HTMLButtonElement =>
    [...item(h, label).querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? plain(b.textContent)) === name)!;
  const key = (target: Element, name: string, init: KeyboardEventInit = {}): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init }));
  };
  const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const patches = (h: ScreenHarness): unknown[] => h.requests.filter((r: DataRequest) => r.method === 'PATCH').map((r) => r.body);
  const open = async (): Promise<ScreenHarness> => {
    const h = await renderScreen({ components: [form], dataSources, respond: (r) => (r.method === 'GET' ? { summary: 'Broken login', description: null, key: 'ODT-1' } : {}) });
    await h.until(() => plain(view(h, 'Summary')?.textContent) === 'Broken login', 'values');
    return h;
  };

  it('shows the values as text: a heading, a placeholder when empty, a read-only field without a button', async () => {
    const h = await open();
    const summary = view(h, 'Summary')!;
    expect(summary.classList.contains('heading')).toBe(true);
    expect(summary.getAttribute('role')).toBe('button');
    expect(summary.getAttribute('tabindex')).toBe('0');
    expect(item(h, 'Summary').querySelector('nz-form-label')?.classList.contains('sr-only')).toBe(true);
    expect(plain(view(h, 'Description')!.textContent)).toBe('Add a description…');
    const locked = view(h, 'Key')!;
    expect(plain(locked.textContent)).toBe('ODT-1');
    expect(locked.hasAttribute('role')).toBe(false);
    expect(locked.hasAttribute('tabindex')).toBe(false);
    expect(h.el.querySelectorAll('input, textarea').length).toBe(0);
    expect(h.reports).toEqual([]);
  });

  it('a click opens only that field, focused; Enter confirms and runs onSave with field and value', async () => {
    const h = await open();
    view(h, 'Summary')!.click();
    await h.until(() => document.activeElement === item(h, 'Summary').querySelector('input'), 'focused editor');
    expect(h.el.querySelectorAll('input, textarea').length).toBe(1);
    const input = item(h, 'Summary').querySelector('input')!;
    type(input, 'Login fails');
    key(input, 'Enter');
    await h.until(() => h.toasts.includes('saved summary=Login fails'), 'saved');
    expect(patches(h)).toEqual([{ summary: 'Login fails' }]);
    await h.until(() => plain(view(h, 'Summary')?.textContent) === 'Login fails', 'closed with the new value');
    expect(document.activeElement).toBe(view(h, 'Summary'));
  });

  it('Escape and ✕ restore the value without saving', async () => {
    const h = await open();
    key(view(h, 'Summary')!, 'Enter');
    await h.settle();
    type(item(h, 'Summary').querySelector('input')!, 'Changed');
    key(item(h, 'Summary').querySelector('input')!, 'Escape');
    await h.until(() => plain(view(h, 'Summary')?.textContent) === 'Broken login', 'restored');
    view(h, 'Summary')!.click();
    await h.settle();
    type(item(h, 'Summary').querySelector('input')!, 'Changed again');
    button(h, 'Summary', 'Cancel').click();
    await h.until(() => plain(view(h, 'Summary')?.textContent) === 'Broken login', 'restored by the button');
    expect(patches(h)).toEqual([]);
  });

  it('the checks of the field keep the editor open with the message; nothing is sent', async () => {
    const h = await open();
    view(h, 'Summary')!.click();
    await h.settle();
    type(item(h, 'Summary').querySelector('input')!, '');
    button(h, 'Summary', 'Confirm').click();
    await h.until(() => plain(item(h, 'Summary').querySelector('.ant-form-item-explain')?.textContent) !== '', 'required message');
    expect(item(h, 'Summary').querySelector('input')).not.toBeNull();
    expect(patches(h)).toEqual([]);
  });

  it('a multi-line field saves with Ctrl+Enter; a confirm without changes runs nothing', async () => {
    const h = await open();
    view(h, 'Description')!.click();
    await h.settle();
    const area = item(h, 'Description').querySelector('textarea')!;
    expect([...item(h, 'Description').querySelectorAll('.editor-actions button')].map((b) => plain(b.textContent))).toEqual(['Save', 'Cancel']);
    key(area, 'Enter');
    await h.settle();
    expect(item(h, 'Description').querySelector('textarea')).not.toBeNull();
    type(area, 'Steps to reproduce');
    key(area, 'Enter', { ctrlKey: true });
    await h.until(() => h.toasts.includes('saved description=Steps to reproduce'), 'saved');
    view(h, 'Summary')!.click();
    await h.settle();
    button(h, 'Summary', 'Confirm').click();
    await h.until(() => view(h, 'Summary') !== null, 'closed');
    expect(patches(h)).toEqual([{ description: 'Steps to reproduce' }]);
  });

  it('opening a field closes the one already open, unchanged', async () => {
    const h = await open();
    view(h, 'Summary')!.click();
    await h.settle();
    type(item(h, 'Summary').querySelector('input')!, 'Half typed');
    view(h, 'Description')!.click();
    await h.settle();
    expect(plain(view(h, 'Summary')?.textContent)).toBe('Broken login');
    expect(item(h, 'Description').querySelector('textarea')).not.toBeNull();
  });

  it('a failed save keeps the editor open, with the field error of the service', async () => {
    const h = await renderScreen({
      components: [form],
      dataSources,
      respond: (r) => {
        if (r.method === 'PATCH') throw Object.assign(new Error('422'), { status: 422, fieldErrors: [{ path: '/summary', code: 'required' }] });
        return { summary: 'Broken login', description: null, key: 'ODT-1' };
      },
    });
    await h.until(() => view(h, 'Summary') !== null, 'values');
    view(h, 'Summary')!.click();
    await h.settle();
    type(item(h, 'Summary').querySelector('input')!, 'Rejected');
    button(h, 'Summary', 'Confirm').click();
    await h.until(() => plain(item(h, 'Summary').querySelector('.ant-form-item-explain')?.textContent) !== '', 'service error');
    expect((item(h, 'Summary').querySelector('input') as HTMLInputElement).value).toBe('Rejected');
  });
});
