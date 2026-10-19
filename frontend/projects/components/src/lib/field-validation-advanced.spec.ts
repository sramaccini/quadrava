import type { DataRequest } from 'core';
import type { FieldDefinition, NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

/** Password fields, remote rules, field errors of the services, limits of choices (ADR-15, phases 2 and 3). */
describe('validation: passwords, remote rules, errors of the services', () => {
  const type = (input: Element | null, value: string, event: 'input' | 'change' = 'input'): void => {
    (input as HTMLInputElement).value = value;
    input!.dispatchEvent(new Event(event));
  };
  const item = (h: ScreenHarness, label: string): HTMLElement =>
    [...h.el.querySelectorAll<HTMLElement>('nz-form-item')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;
  const input = (h: ScreenHarness, label: string): HTMLInputElement => item(h, label).querySelector('input') as HTMLInputElement;
  const message = (h: ScreenHarness, label: string): string => plain(item(h, label).querySelector('.ant-form-item-explain')?.textContent);
  const save = async (h: ScreenHarness): Promise<void> => {
    [...h.el.querySelectorAll<HTMLButtonElement>('lc-form button')].find((b) => plain(b.textContent) === 'Save')!.click();
    await h.settle();
  };
  const form = (fields: FieldDefinition[], steps: unknown[] = [{ toast: 'saved' }]): NodeDefinition =>
    ({ type: 'form', fields, actions: [{ label: 'Save', onClick: steps }] }) as NodeDefinition;

  describe('password', () => {
    it('masked, with a button that shows it; current-password unless it is a new one', async () => {
      const h = await renderScreen({ components: [form([{ name: 'pw', type: 'password', label: 'Password' }])] });
      const box = input(h, 'Password');
      expect(box.type).toBe('password');
      expect(box.getAttribute('autocomplete')).toBe('current-password');
      const reveal = item(h, 'Password').querySelector('button.reveal') as HTMLButtonElement;
      expect(reveal.getAttribute('aria-label')).toBe('Show the password');
      expect(reveal.getAttribute('aria-pressed')).toBe('false');
      reveal.click();
      await h.settle();
      expect(box.type).toBe('text');
      expect(reveal.getAttribute('aria-label')).toBe('Hide the password');
      expect(reveal.getAttribute('aria-pressed')).toBe('true');
      expect(item(h, 'Password').querySelector('.strength')).toBeNull();
    });

    it('a new password has the strength meter, in text too, and minStrength blocks a weak one', async () => {
      const h = await renderScreen({
        components: [form([{ name: 'email', type: 'text', label: 'Email' }, { name: 'pw', type: 'password', label: 'Password', newPassword: true, minStrength: 3 }])],
      });
      const box = input(h, 'Password');
      expect(box.getAttribute('autocomplete')).toBe('new-password');
      const meter = item(h, 'Password').querySelector('.strength') as HTMLElement;
      expect(meter.getAttribute('aria-live')).toBe('polite');
      expect(box.getAttribute('aria-describedby')).toBe(meter.id);
      type(box, 'Password1');
      await h.settle();
      expect(plain(meter.querySelector('.level')?.textContent)).toBe('Password strength: very weak');
      expect(plain(meter.querySelector('.advice')?.textContent)).toBe('Avoid common words and passwords.');
      await save(h);
      expect(message(h, 'Password')).toBe('Choose a stronger password');
      type(box, 'Xr7$mQ2v!kL9pW');
      await h.settle();
      expect(plain(meter.querySelector('.level')?.textContent)).toBe('Password strength: strong');
      expect(meter.querySelectorAll('.bars span.on')).toHaveLength(4);
      expect(message(h, 'Password')).toBe('');
    });

    it('is not shown in a filter bar', async () => {
      const h = await renderScreen({ components: [{ type: 'filterBar', bind: 'state.f', fields: [{ name: 'q', type: 'text', label: 'Text' }, { name: 'pw', type: 'password', label: 'Password' }] }] });
      expect(h.el.querySelectorAll('lc-filter-bar nz-form-item')).toHaveLength(1);
    });
  });

  describe('remote rules', () => {
    const taken = new Set(['S000001']);
    const dataSources = {
      checkStaff: { type: 'rest' as const, method: 'GET' as const, url: '/api/staff/check', params: { number: '{{ value }}' } },
      save: { type: 'rest' as const, method: 'POST' as const, url: '/api/staff', body: '{{ form }}' },
    };
    const respond = (r: DataRequest) => (r.url === '/api/staff/check' ? { valid: !taken.has(String(r.query?.['number'])), code: 'taken' } : { ok: true });
    const staff: FieldDefinition = { name: 'staff', type: 'text', label: 'Staff number', pattern: 'S\\d{6}', validation: [{ remote: 'checkStaff', debounce: 100, message: 'Already used' }] };

    it('checks while the user types, shows the outcome before saving, and does not load when the screen opens', async () => {
      const h = await renderScreen({ components: [form([staff])], dataSources, respond });
      expect(h.requests).toEqual([]);
      type(input(h, 'Staff number'), 'S000001');
      await h.until(() => message(h, 'Staff number') === 'Already used', 'remote outcome');
      expect(h.requests.map((r) => r.query)).toEqual([{ number: 'S000001' }]);
      type(input(h, 'Staff number'), 'S000002');
      await h.until(() => h.requests.length === 2, 'second check');
      await h.until(() => message(h, 'Staff number') === '', 'free number');
    });

    it('saving waits for the check in progress', async () => {
      const h = await renderScreen({ components: [form([staff], [{ call: 'save' }, { toast: 'saved' }])], dataSources, respond });
      type(input(h, 'Staff number'), 'S000001');
      await save(h);
      await h.until(() => message(h, 'Staff number') === 'Already used', 'checked before sending');
      expect(h.requests.some((r) => r.method === 'POST')).toBe(false);
      type(input(h, 'Staff number'), 'S000003');
      await save(h);
      await h.until(() => h.toasts.includes('saved'), 'saved');
    });

    it('a standalone field still being checked does not pass the validate step', async () => {
      const h = await renderScreen({
        components: [
          { type: 'input', field: { ...staff, validation: [{ remote: 'checkStaff', debounce: 3000 }] } },
          { type: 'button', label: 'Go', onClick: [{ validate: '*' }, { toast: 'went' }] },
        ] as NodeDefinition[],
        dataSources,
        respond,
      });
      type(h.el.querySelector('lc-input input'), 'S000004', 'change');
      await h.settle();
      expect(h.el.querySelector('lc-input .ant-form-item-is-validating, lc-input nz-form-control .ant-form-item-feedback-icon')).not.toBeNull();
      (h.el.querySelector('lc-button button') as HTMLButtonElement).click();
      await h.settle();
      expect(h.toasts).not.toContain('went');
    });
  });

  describe('errors of the services', () => {
    const dataSources = { save: { type: 'rest' as const, method: 'POST' as const, url: '/api/staff', body: '{{ form }}' } };
    const problem = () => {
      throw Object.assign(new Error('422'), {
        status: 422,
        fieldErrors: [
          { path: '/email', code: 'taken' },
          { path: '/lines/1/code', code: 'maxLength', params: { max: 3 } },
          { path: '/unknown', code: 'x' },
        ],
      });
    };

    it('go to their fields and cells until those change; the default message asks to check them', async () => {
      const h = await renderScreen({
        components: [
          form(
            [
              { name: 'email', type: 'text', label: 'Email' },
              { name: 'lines', type: 'repeater', label: 'Lines', minRows: 2, fields: [{ name: 'code', type: 'text', label: 'Code' }] },
            ],
            [{ call: 'save' }, { toast: 'saved' }],
          ),
        ],
        dataSources,
        respond: problem,
      });
      type(input(h, 'Email'), 'a@b.it');
      await save(h);
      await h.until(() => message(h, 'Email') !== '', 'field error');
      // validation.taken is not in the catalogue: the generic message.
      expect(message(h, 'Email')).toBe('Invalid value');
      expect([...h.el.querySelectorAll('lc-repeater .cell-error')].map((e) => plain(e.textContent))).toEqual(['Enter at most 3 characters']);
      expect(h.toasts).toEqual(['Check the highlighted fields']);
      type(input(h, 'Email'), 'other@b.it');
      await h.settle();
      expect(message(h, 'Email')).toBe('');
    });
  });

  it('limits of a multiple choice and relative dates', async () => {
    const h = await renderScreen({
      components: [
        form([
          { name: 'tags', type: 'multiselect', label: 'Tags', options: ['a', 'b', 'c'], maxItems: 1 },
          { name: 'day', type: 'date', label: 'Day', minDate: 'today' },
        ]),
      ],
    });
    await save(h);
    expect(message(h, 'Tags')).toBe('');
    expect(h.toasts).toEqual(['saved']);
  });
});
