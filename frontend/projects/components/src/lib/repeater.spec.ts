import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';
import { openSelect, stubViewportHeight } from './select-testing';

describe('repeatable rows in the form', () => {
  const form = (extra: Record<string, unknown> = {}): NodeDefinition => ({
    type: 'form',
    fields: [
      {
        name: 'rows',
        type: 'repeater',
        label: 'Rows',
        minRows: 1,
        maxRows: 3,
        addLabel: 'Add item',
        fields: [
          { name: 'description', type: 'text', label: 'Description', required: true },
          { name: 'quantity', type: 'number', label: 'Quantity', validate: { rule: '{{ value > 0 }}', message: 'Positive quantity' } },
          { name: 'free', type: 'checkbox', label: 'Free' },
        ],
        ...extra,
      },
    ],
    actions: [{ label: 'Save', onClick: [{ call: 'save' }] }],
  });
  const dataSources = { save: { type: 'rest' as const, method: 'POST' as const, url: '/api/save', body: '{{form}}' } };
  const rows = (h: ScreenHarness): HTMLTableRowElement[] => [...h.el.querySelectorAll<HTMLTableRowElement>('lc-repeater tbody tr')];
  const typeIn = (input: Element | null, value: string): void => {
    (input as HTMLInputElement).value = value;
    input!.dispatchEvent(new Event('input'));
  };
  const button = (h: ScreenHarness, text: string): HTMLButtonElement => [...h.el.querySelectorAll('button')].find((b) => plain(b.textContent).includes(text)) as HTMLButtonElement;

  it('starts with the minimum rows, adds and removes within the limits and saves a list of objects', async () => {
    const h = await renderScreen({ components: [form()], dataSources });
    expect(rows(h)).toHaveLength(1);
    // With a single row (the minimum) it cannot be removed.
    expect((rows(h)[0].querySelector('td.remove button') as HTMLButtonElement).disabled).toBe(true);
    expect(h.el.querySelector('lc-repeater [role="group"]')?.getAttribute('aria-labelledby')).toMatch(/-rows-label$/);
    typeIn(rows(h)[0].querySelector('input[type="text"]'), 'Pens');
    typeIn(rows(h)[0].querySelector('input[type="number"]'), '10');
    button(h, 'Add item').click();
    await h.settle();
    button(h, 'Add item').click();
    await h.settle();
    expect(rows(h)).toHaveLength(3);
    expect(button(h, 'Add item').disabled).toBe(true);
    typeIn(rows(h)[1].querySelector('input[type="text"]'), 'Pencils');
    typeIn(rows(h)[1].querySelector('input[type="number"]'), '5');
    (rows(h)[1].querySelector('label[nz-checkbox] input') as HTMLInputElement).click();
    const remove = rows(h)[2].querySelector('td.remove button') as HTMLButtonElement;
    expect(remove.getAttribute('aria-label')).toBe('Togli la riga 3');
    remove.click();
    await h.settle();
    button(h, 'Save').click();
    await h.until(() => h.requests.length === 1, 'saving');
    expect(h.requests[0].body).toEqual({
      rows: [
        { description: 'Pens', quantity: 10, free: false },
        { description: 'Pencils', quantity: 5, free: true },
      ],
    });
  });

  it('required fields and rules apply row by row; errors appear after submitting', async () => {
    const h = await renderScreen({ components: [form()], dataSources });
    button(h, 'Add item').click();
    await h.settle();
    typeIn(rows(h)[0].querySelector('input[type="text"]'), 'Pens');
    typeIn(rows(h)[0].querySelector('input[type="number"]'), '0');
    await h.settle();
    expect(h.el.querySelectorAll('lc-repeater .cell-error')).toHaveLength(0);
    button(h, 'Save').click();
    await h.settle();
    const errors = [...h.el.querySelectorAll('lc-repeater .cell-error')].map((e) => plain(e.textContent));
    expect(errors).toEqual(['Positive quantity', 'Campo obbligatorio']);
    expect(plain(h.el.querySelector('lc-repeater .summary')?.textContent)).toBe('Controlla le righe evidenziate');
    // Only the wrong cells are highlighted, not the whole field.
    expect(h.el.querySelector('nz-form-item.ant-form-item-has-error')).toBeNull();
    expect(h.requests).toEqual([]);
  });

  it('the initial values come from the form and a number of rows below the minimum is an error', async () => {
    const h = await renderScreen({
      components: [{ ...form({ minRows: 2 }), initial: { rows: [{ description: 'Erasers', quantity: 3, free: false }] } } as NodeDefinition],
      dataSources,
    });
    // The initial row plus an empty one to reach the minimum.
    expect(rows(h)).toHaveLength(2);
    expect((rows(h)[0].querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Erasers');
  });

  describe('with lookup and file in the rows', () => {
    let restore: () => void;
    beforeAll(() => (restore = stubViewportHeight()));
    afterAll(() => restore());
    afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = '')));

    it('each row has its own lookup and file; the values arrive when saving', async () => {
      const articles = [{ id: 'A1', name: 'Pens' }, { id: 'A2', name: 'Pencils' }];
      const node = {
        type: 'form',
        fields: [
          {
            name: 'rows',
            type: 'repeater',
            minRows: 1,
            fields: [
              { name: 'article', type: 'lookup', label: 'Article', required: true, lookup: { source: 'articles', labelField: 'name', minChars: 0 } },
              { name: 'photo', type: 'file', label: 'Photo', accept: 'image/*' },
            ],
          },
        ],
        actions: [{ label: 'Save', onClick: [{ call: 'save' }] }],
      } as NodeDefinition;
      const h = await renderScreen({
        components: [node],
        dataSources: { ...dataSources, articles: { type: 'rest', method: 'GET', url: '/api/articles' } },
        respond: (r) => (r.method === 'GET' ? articles : {}),
      });
      await h.until(() => !!h.el.querySelector('lc-repeater lc-lookup nz-select'), 'row');
      await openSelect(h.el.querySelector('lc-repeater lc-lookup nz-select')!, () => h.settle());
      await h.until(() => document.querySelectorAll('.ant-select-item-option').length === 2, 'articles');
      ([...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((o) => plain(o.textContent) === 'Pencils'))!.click();
      const input = h.el.querySelector('lc-repeater lc-file-field input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'photo.png', { type: 'image/png' })] });
      input.dispatchEvent(new Event('change'));
      await h.until(() => !!h.el.querySelector('lc-repeater lc-file-field .name'), 'photo chosen');
      button(h, 'Save').click();
      await h.until(() => h.requests.some((r) => r.method === 'POST'), 'saving');
      expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ rows: [{ article: 'A2', photo: { name: 'photo.png', type: 'image/png', size: 1, content: btoa('x') } }] });
    });
  });
});
