import type { DataRequest } from 'core';
import type { NodeDefinition } from 'schema';
import { plain, renderScreen, type ScreenHarness } from './screen-testing';

describe('text field with suggestions', () => {
  const words = [
    { value: 'status:', label: 'status', hint: 'State of the task' },
    { value: 'assignee:', label: 'assignee', hint: 'Person' },
    { value: 'status:open', label: 'status:open' },
  ];
  const form: NodeDefinition = {
    type: 'form',
    fields: [{ name: 'query', type: 'text', label: 'Query', suggest: { source: 'words', descriptionField: 'hint', labelField: 'label' } }],
    actions: [{ label: 'Search', onClick: [{ call: 'run' }] }],
  };
  const dataSources = {
    words: { type: 'rest' as const, method: 'GET' as const, url: '/api/words', params: { q: '{{ search }}', word: '{{ word }}' } },
    run: { type: 'rest' as const, method: 'POST' as const, url: '/api/run', body: '{{form}}' },
  };
  /** Suggests the words that start with `word`; the words listed in `slow` arrive late. */
  const respondWith = (slow: string[] = []) => async (r: DataRequest) => {
    const word = String(r.query?.['word'] ?? '');
    if (slow.includes(word)) await new Promise((res) => setTimeout(res, 600));
    return r.method === 'GET' ? words.filter((w) => word !== '' && w.value.startsWith(word)) : {};
  };
  const box = (h: ScreenHarness) => h.el.querySelector('lc-suggest-input input') as HTMLInputElement;
  const type = (h: ScreenHarness, text: string, caret = text.length): void => {
    const input = box(h);
    input.value = text;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input'));
  };
  const key = (h: ScreenHarness, name: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    box(h).dispatchEvent(event);
    return event;
  };
  const options = (h: ScreenHarness): string[] => [...h.el.querySelectorAll('[role="option"]')].map((o) => plain(o.textContent));
  const asked = (h: ScreenHarness) => h.requests.filter((r) => r.query?.['word']).map((r) => [r.query?.['q'], r.query?.['word']]);

  it('asks with the text and the word at the cursor, and a suggestion replaces only that word', async () => {
    const h = await renderScreen({ components: [form], dataSources, respond: respondWith() });
    expect(box(h).getAttribute('role')).toBe('combobox');
    expect(box(h).getAttribute('aria-expanded')).toBe('false');
    type(h, 'bug st');
    type(h, 'bug sta');
    await h.until(() => options(h).length === 2, 'suggestions');
    // Keystrokes close together become a single request.
    expect(asked(h)).toEqual([['bug sta', 'sta']]);
    expect(options(h)).toEqual(['status State of the task', 'status:open']);
    expect(box(h).getAttribute('aria-expanded')).toBe('true');
    expect(plain(h.el.querySelector('lc-suggest-input [aria-live]')?.textContent)).toContain('Suggestions: 2');

    // The arrows move in the list (the active one is announced through aria-activedescendant), Enter inserts.
    key(h, 'ArrowDown');
    key(h, 'ArrowDown');
    await h.settle();
    const active = box(h).getAttribute('aria-activedescendant');
    expect(h.el.querySelector(`#${active}`)?.getAttribute('aria-selected')).toBe('true');
    expect(plain(h.el.querySelector(`#${active}`)?.textContent)).toBe('status:open');
    expect(key(h, 'Enter').defaultPrevented).toBe(true);
    await h.settle();
    expect(box(h).value).toBe('bug status:open');
    expect(options(h)).toEqual([]);
    expect(box(h).getAttribute('aria-expanded')).toBe('false');

    // The value is free text: the form sends what is written.
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Search')) as HTMLButtonElement).click();
    await h.until(() => h.requests.some((r) => r.method === 'POST'), 'search');
    expect(h.requests.find((r) => r.method === 'POST')?.body).toEqual({ query: 'bug status:open' });
    expect(h.reports).toEqual([]);
  });

  it('in the middle of the text, with the mouse; Escape closes the list; an older response is discarded', async () => {
    const h = await renderScreen({ components: [form], dataSources, respond: respondWith(['st']) });
    type(h, 'st and x', 2);
    await new Promise((r) => setTimeout(r, 350));
    type(h, 'as and x', 2);
    await h.until(() => options(h).length === 1, 'suggestion for «as»');
    await new Promise((r) => setTimeout(r, 700));
    await h.settle();
    // The slow response for «st» arrived after the one for «as»: it does not replace it.
    expect(options(h)).toEqual(['assignee Person']);
    (h.el.querySelector('[role="option"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.settle();
    expect(box(h).value).toBe('assignee: and x');
    expect(box(h).selectionStart).toBe('assignee:'.length);

    type(h, 'assignee: and sta');
    await h.until(() => options(h).length === 2, 'suggestions for «sta»');
    // Escape closes only the list: it does not reach the dialog around the field.
    let reached = 0;
    h.el.addEventListener('keydown', () => reached++);
    key(h, 'Escape');
    await h.settle();
    expect(options(h)).toEqual([]);
    expect(reached).toBe(0);
    key(h, 'Escape');
    expect(reached).toBe(1);
  });
});
