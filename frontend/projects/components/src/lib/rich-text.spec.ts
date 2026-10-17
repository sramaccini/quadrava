import type { NodeDefinition } from 'schema';
import { domToMarkdown, renderMarkdownInto } from './rich-text-dom';
import { plain, renderScreen } from './screen-testing';

describe('formatted text (restricted Markdown)', () => {
  it('the text component with markdown format: headings, nested lists, emphasis, safe links', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'text',
          format: 'markdown',
          text: '# Instructions\n\nBefore **sending**:\n\n- check *the data*\n- attach:\n  1. invoice\n  2. order\n\n> Note well\n\n[Guide](https://example.com/guide) and [internal](/showcase/showcase-base) and [no](javascript:alert(1))',
        },
        { type: 'text', text: 'Line one\nline two' },
      ],
    });
    const md = h.el.querySelector('lc-text lc-markdown') as HTMLElement;
    expect(plain(md.querySelector('h3')?.textContent)).toBe('Instructions');
    expect(md.querySelector('p strong')?.textContent).toBe('sending');
    expect([...md.querySelectorAll(':scope > ul > li')].length).toBe(2);
    expect([...md.querySelectorAll('ul ol li')].map((li) => plain(li.textContent))).toEqual(['invoice', 'order']);
    expect(plain(md.querySelector('blockquote')?.textContent)).toBe('Note well');
    const links = [...md.querySelectorAll('a')];
    expect(links.map((a) => [a.getAttribute('href'), a.target, a.rel])).toEqual([
      ['https://example.com/guide', '_blank', 'noopener noreferrer'],
      ['/showcase/showcase-base', '', ''],
    ]);
    // The dangerous link stays text.
    expect(md.textContent).toContain('[no](javascript:alert(1))');
    // Plain text keeps its line breaks.
    expect(getComputedStyle(h.el.querySelectorAll('lc-text')[1].querySelector('p')!).whiteSpace).toBe('pre-line');
  });

  it('HTML in the data stays text: no element is created from the content', async () => {
    const h = await renderScreen({
      components: [{ type: 'text', format: 'markdown', text: '{{ "<img src=x onerror=alert(1)> **ok**" }}' }],
    });
    const md = h.el.querySelector('lc-markdown') as HTMLElement;
    expect(md.querySelector('img')).toBeNull();
    expect(md.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(md.querySelector('strong')?.textContent).toBe('ok');
  });

  it('formatted message and detail field with markdown format', async () => {
    const h = await renderScreen({
      components: [
        { type: 'alert', kind: 'info', format: 'markdown', text: 'Remember: **two** things\n\n- one\n- two' },
        { type: 'detail', source: 'detail', fields: [{ field: 'note', label: 'Notes', format: 'markdown' }] },
      ] as NodeDefinition[],
      dataSources: { detail: { type: 'rest', method: 'GET', url: '/api/x' } },
      respond: () => ({ note: '- first\n- *second*' }),
    });
    expect(h.el.querySelector('lc-alert lc-markdown strong')?.textContent).toBe('two');
    await h.until(() => !!h.el.querySelector('lc-detail lc-markdown li'), 'detail');
    expect([...h.el.querySelectorAll('lc-detail lc-markdown li')].map((li) => plain(li.textContent))).toEqual(['first', 'second']);
  });
});

describe('rich text editor: conversions', () => {
  const area = () => document.createElement('div');

  it('round trip: the Markdown stays the same', () => {
    const source = '# Title\n\nText with **bold**, *italic*, ~~gone~~ and `code`.\n\n- one\n- two\n  - two.a\n\n1. first\n2. second\n\n> quote\n\n[Site](https://example.com)';
    const el = area();
    renderMarkdownInto(el, source);
    expect(domToMarkdown(el)).toBe(source);
  });

  it('what the browser produces is reduced to the allowed format; scripts, styles and dangerous links disappear', () => {
    const doc = new DOMParser().parseFromString(
      '<div>Hello <b>world</b><span style="color:red"> red</span></div><div><i>italic</i><br>line</div>' +
        '<script>alert(1)</script><ul><li>a<ol><li>b</li></ol></li></ul><h2>Title</h2>' +
        '<p><a href="javascript:alert(1)">click</a> <a href="https://ok.it">ok</a> <img src="x" onerror="alert(1)">end</p>',
      'text/html',
    );
    const el = area();
    el.append(...Array.from(doc.body.childNodes));
    expect(domToMarkdown(el)).toBe('Hello **world** red\n\n*italic*\nline\n\nalert(1)\n\n- a\n  1. b\n\n# Title\n\nclick [ok](https://ok.it) end');
  });

  it('special characters typed by the user are escaped and do not become formatting', () => {
    const el = area();
    el.appendChild(document.createElement('p')).textContent = '- not a list, 2 * 3 and [x](y)';
    const md = domToMarkdown(el);
    expect(md).toBe('\\- not a list, 2 \\* 3 and \\[x\\](y)');
    const back = area();
    renderMarkdownInto(back, md);
    expect(back.querySelector('ul')).toBeNull();
    expect(back.textContent).toBe('- not a list, 2 * 3 and [x](y)');
  });

  it('an empty editor has a paragraph to write in and is worth empty', () => {
    const el = area();
    renderMarkdownInto(el, '');
    expect(el.querySelector('p')).not.toBeNull();
    expect(domToMarkdown(el)).toBe('');
  });
});

describe('richtext field', () => {
  it('in the form: shows the formatted value, accessible, and reads it back as Markdown when the content changes', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'form',
          initial: { note: '**Urgent**\n\n- first point' },
          fields: [{ name: 'note', type: 'richtext', label: 'Notes', required: true }],
          actions: [{ label: 'Send', onClick: [{ toast: '{{ form.note }}' }] }],
        },
      ],
    });
    const box = h.el.querySelector('lc-rich-text-editor .area') as HTMLElement;
    expect(box.getAttribute('role')).toBe('textbox');
    expect(box.getAttribute('aria-multiline')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toContain('Notes');
    expect(box.querySelector('strong')?.textContent).toBe('Urgent');
    expect(h.el.querySelectorAll('lc-rich-text-editor [role="toolbar"] button').length).toBe(9);
    // A change in the area (like the browser's) becomes Markdown.
    box.querySelector('li')!.appendChild(document.createTextNode(' and second'));
    box.dispatchEvent(new Event('input'));
    await h.settle();
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Send')) as HTMLButtonElement).click();
    await h.until(() => h.toasts.length === 1, 'sending');
    expect(h.toasts).toEqual(['**Urgent**\n\n- first point and second']);
  });

  it('standalone field: the value goes to the state when leaving the editor; read-only has no toolbar', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'text', type: 'richtext', label: 'Text' } },
        { type: 'input', readOnlyIf: '{{ true }}', default: '*fixed*', field: { name: 'fixed', type: 'richtext', label: 'Fixed' } },
        { id: 'show', type: 'text', format: 'markdown', text: "{{ state.text == null ? '' : state.text }}" },
      ],
    });
    const [editable, locked] = [...h.el.querySelectorAll<HTMLElement>('lc-rich-text-editor')];
    expect(locked.querySelector('[role="toolbar"]')).toBeNull();
    expect(locked.querySelector('.area')?.getAttribute('contenteditable')).toBe('false');
    const area = editable.querySelector('.area') as HTMLElement;
    area.replaceChildren(document.createElement('ul'));
    area.firstElementChild!.appendChild(document.createElement('li')).textContent = 'item';
    area.dispatchEvent(new Event('input'));
    await h.settle();
    expect(h.el.querySelector('[data-node-id="show"] li')).toBeNull();
    area.dispatchEvent(new Event('blur'));
    await h.until(() => plain(h.el.querySelector('[data-node-id="show"] li')?.textContent) === 'item', 'state');
  });
});
