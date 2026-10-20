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

    it('a confirmation with the same text does not weaken the password; a name does', async () => {
      const h = await renderScreen({
        components: [
          form([
            { name: 'name', type: 'text', label: 'Name' },
            { name: 'pw', type: 'password', label: 'Password', newPassword: true },
            { name: 'confirm', type: 'password', label: 'Confirm', validation: [{ sameAs: 'pw' }] },
          ]),
        ],
      });
      const level = (): string => plain(item(h, 'Password').querySelector('.strength .level')?.textContent);
      type(input(h, 'Password'), 'Xr7$mQ2v!kL9pW');
      type(input(h, 'Confirm'), 'Xr7$mQ2v!kL9pW');
      await h.settle();
      expect(level()).toBe('Password strength: strong');
      type(input(h, 'Name'), 'Xr7$mQ2v');
      await h.settle();
      expect(level()).not.toBe('Password strength: strong');
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

  describe('standalone fields of a validation group', () => {
    /** The message of a standalone field, by its label. */
    const standalone = (h: ScreenHarness, label: string): HTMLElement =>
      [...h.el.querySelectorAll<HTMLElement>('lc-input')].find((i) => plain(i.querySelector('nz-form-label')?.textContent) === label)!;
    const note = (h: ScreenHarness, label: string): string => plain(standalone(h, label).querySelector('.ant-form-item-explain')?.textContent);
    const change = (h: ScreenHarness, label: string, value: string): void => type(standalone(h, label).querySelector('input'), value, 'change');
    const field = (name: string, label: string, extra: Partial<FieldDefinition> = {}): NodeDefinition =>
      ({ type: 'input', group: 'contact', field: { name, type: 'text', label, ...extra } }) as NodeDefinition;

    it('rules across fields read the values of the group', async () => {
      const h = await renderScreen({
        components: [
          field('email', 'Email'),
          field('confirm', 'Confirm', { validation: [{ sameAs: 'email' }] }),
          field('phone', 'Phone', { validation: [{ atLeastOne: ['email'] }, { rule: "{{ form.email != 'x@y.it' }}", message: 'Not that one' }] }),
          { type: 'input', field: { name: 'elsewhere', type: 'text', label: 'Elsewhere', validation: [{ sameAs: 'email' }] } } as NodeDefinition,
          { type: 'button', label: 'Check', onClick: [{ validate: 'contact' }, { toast: 'valid' }] } as NodeDefinition,
        ],
      });
      (h.el.querySelector('lc-button button') as HTMLButtonElement).click();
      await h.settle();
      expect(note(h, 'Phone')).toBe('Fill in at least one of: Email');
      expect(h.toasts).not.toContain('valid');
      change(h, 'Email', 'x@y.it');
      change(h, 'Confirm', 'z@y.it');
      await h.settle();
      expect(note(h, 'Confirm')).toBe('Does not match “Email”');
      expect(note(h, 'Phone')).toBe('');
      change(h, 'Phone', '0612345');
      await h.settle();
      expect(note(h, 'Phone')).toBe('Not that one');
      // Another group does not see the field.
      change(h, 'Elsewhere', 'x@y.it');
      await h.settle();
      expect(note(h, 'Elsewhere')).toBe('Does not match “email”');
    });

    it('the field errors of a call started by a button go to the standalone fields by name', async () => {
      const h = await renderScreen({
        components: [
          field('email', 'Email'),
          { type: 'button', label: 'Send', onClick: [{ call: 'send' }] } as NodeDefinition,
        ],
        dataSources: { send: { type: 'rest', method: 'POST', url: '/api/send', body: { email: '{{ state.email }}' } } },
        respond: () => {
          throw Object.assign(new Error('422'), { status: 422, fieldErrors: [{ path: '/email', code: 'email' }] });
        },
      });
      change(h, 'Email', 'a@b.it');
      (h.el.querySelector('lc-button button') as HTMLButtonElement).click();
      await h.until(() => note(h, 'Email') !== '', 'field error');
      expect(note(h, 'Email')).toBe('Enter a valid email address');
      expect(h.toasts).toEqual(['Check the highlighted fields']);
      change(h, 'Email', 'c@d.it');
      await h.settle();
      expect(note(h, 'Email')).toBe('');
    });
  });

  it('remote rules in the rows of a repeater: per cell, shown as soon as known, waited for before sending', async () => {
    const used = new Set(['A1']);
    const h = await renderScreen({
      components: [
        form(
          [
            {
              name: 'lines',
              type: 'repeater',
              label: 'Lines',
              minRows: 2,
              fields: [{ name: 'code', type: 'text', label: 'Code', validation: [{ remote: 'checkCode', debounce: 100, message: 'Code already used' }] }],
            },
          ],
          [{ toast: 'saved' }],
        ),
      ],
      dataSources: { checkCode: { type: 'rest', method: 'GET', url: '/api/code', params: { code: '{{ value }}' } } },
      respond: (r) => !used.has(String(r.query?.['code'])),
    });
    const cells = [...h.el.querySelectorAll('lc-repeater input')];
    type(cells[0], 'A1');
    type(cells[1], 'B2');
    await h.until(() => [...h.el.querySelectorAll('lc-repeater .cell-error')].length === 1, 'remote outcome of the cells');
    expect(plain(h.el.querySelector('lc-repeater .cell-error')?.textContent)).toBe('Code already used');
    expect(h.requests.map((r) => r.query?.['code']).sort()).toEqual(['A1', 'B2']);
    await save(h);
    expect(h.toasts).toEqual([]);
    type(cells[0], 'C3');
    await save(h);
    await h.until(() => h.toasts.includes('saved'), 'saved after the check');
  });
});
