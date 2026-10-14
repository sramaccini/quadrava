import type { NodeDefinition } from 'schema';
import { domToMarkdown, renderMarkdownInto } from './rich-text-dom';
import { plain, renderScreen } from './screen-testing';

describe('testo formattato (Markdown ristretto)', () => {
  it('il componente text con format markdown: titoli, elenchi annidati, enfasi, collegamenti sicuri', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'text',
          format: 'markdown',
          text: '# Istruzioni\n\nPrima di **inviare**:\n\n- controlla *i dati*\n- allega:\n  1. fattura\n  2. ordine\n\n> Nota bene\n\n[Guida](https://example.com/guida) e [interna](/vetrina/vetrina-base) e [no](javascript:alert(1))',
        },
        { type: 'text', text: 'Riga uno\nriga due' },
      ],
    });
    const md = h.el.querySelector('lc-text lc-markdown') as HTMLElement;
    expect(plain(md.querySelector('h3')?.textContent)).toBe('Istruzioni');
    expect(md.querySelector('p strong')?.textContent).toBe('inviare');
    expect([...md.querySelectorAll(':scope > ul > li')].length).toBe(2);
    expect([...md.querySelectorAll('ul ol li')].map((li) => plain(li.textContent))).toEqual(['fattura', 'ordine']);
    expect(plain(md.querySelector('blockquote')?.textContent)).toBe('Nota bene');
    const links = [...md.querySelectorAll('a')];
    expect(links.map((a) => [a.getAttribute('href'), a.target, a.rel])).toEqual([
      ['https://example.com/guida', '_blank', 'noopener noreferrer'],
      ['/vetrina/vetrina-base', '', ''],
    ]);
    // Il collegamento pericoloso resta testo.
    expect(md.textContent).toContain('[no](javascript:alert(1))');
    // Il testo semplice tiene gli a capo.
    expect(getComputedStyle(h.el.querySelectorAll('lc-text')[1].querySelector('p')!).whiteSpace).toBe('pre-line');
  });

  it('HTML nei dati resta testo: nessun elemento creato dal contenuto', async () => {
    const h = await renderScreen({
      components: [{ type: 'text', format: 'markdown', text: '{{ "<img src=x onerror=alert(1)> **ok**" }}' }],
    });
    const md = h.el.querySelector('lc-markdown') as HTMLElement;
    expect(md.querySelector('img')).toBeNull();
    expect(md.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(md.querySelector('strong')?.textContent).toBe('ok');
  });

  it('messaggio formattato e campo di dettaglio con formato markdown', async () => {
    const h = await renderScreen({
      components: [
        { type: 'alert', kind: 'info', format: 'markdown', text: 'Ricorda: **due** cose\n\n- una\n- due' },
        { type: 'detail', source: 'dettaglio', fields: [{ field: 'note', label: 'Note', format: 'markdown' }] },
      ] as NodeDefinition[],
      dataSources: { dettaglio: { type: 'rest', method: 'GET', url: '/api/x' } },
      respond: () => ({ note: '- primo\n- *secondo*' }),
    });
    expect(h.el.querySelector('lc-alert lc-markdown strong')?.textContent).toBe('due');
    await h.until(() => !!h.el.querySelector('lc-detail lc-markdown li'), 'dettaglio');
    expect([...h.el.querySelectorAll('lc-detail lc-markdown li')].map((li) => plain(li.textContent))).toEqual(['primo', 'secondo']);
  });
});

describe('editor di testo formattato: conversioni', () => {
  const area = () => document.createElement('div');

  it('andata e ritorno: il Markdown resta lo stesso', () => {
    const source = '# Titolo\n\nTesto con **grassetto**, *corsivo*, ~~via~~ e `codice`.\n\n- uno\n- due\n  - due.a\n\n1. primo\n2. secondo\n\n> citazione\n\n[Sito](https://example.com)';
    const el = area();
    renderMarkdownInto(el, source);
    expect(domToMarkdown(el)).toBe(source);
  });

  it('quello che il browser produce si riduce al formato ammesso; script, stili e collegamenti pericolosi spariscono', () => {
    const doc = new DOMParser().parseFromString(
      '<div>Ciao <b>mondo</b><span style="color:red"> rosso</span></div><div><i>corsivo</i><br>riga</div>' +
        '<script>alert(1)</script><ul><li>a<ol><li>b</li></ol></li></ul><h2>Titolo</h2>' +
        '<p><a href="javascript:alert(1)">clic</a> <a href="https://ok.it">ok</a> <img src="x" onerror="alert(1)">fine</p>',
      'text/html',
    );
    const el = area();
    el.append(...Array.from(doc.body.childNodes));
    expect(domToMarkdown(el)).toBe('Ciao **mondo** rosso\n\n*corsivo*\nriga\n\nalert(1)\n\n- a\n  1. b\n\n# Titolo\n\nclic [ok](https://ok.it) fine');
  });

  it('i caratteri speciali scritti dall’utente si proteggono e non diventano formattazione', () => {
    const el = area();
    el.appendChild(document.createElement('p')).textContent = '- non è un elenco, 2 * 3 e [x](y)';
    const md = domToMarkdown(el);
    expect(md).toBe('\\- non è un elenco, 2 \\* 3 e \\[x\\](y)');
    const back = area();
    renderMarkdownInto(back, md);
    expect(back.querySelector('ul')).toBeNull();
    expect(back.textContent).toBe('- non è un elenco, 2 * 3 e [x](y)');
  });

  it('un editor vuoto ha un paragrafo in cui scrivere e vale vuoto', () => {
    const el = area();
    renderMarkdownInto(el, '');
    expect(el.querySelector('p')).not.toBeNull();
    expect(domToMarkdown(el)).toBe('');
  });
});

describe('campo richtext', () => {
  it('nel form: mostra il valore formattato, accessibile, e lo rilegge in Markdown modificando il contenuto', async () => {
    const h = await renderScreen({
      components: [
        {
          type: 'form',
          initial: { note: '**Urgente**\n\n- primo punto' },
          fields: [{ name: 'note', type: 'richtext', label: 'Note', required: true }],
          actions: [{ label: 'Invia', onClick: [{ toast: '{{ form.note }}' }] }],
        },
      ],
    });
    const box = h.el.querySelector('lc-rich-text-editor .area') as HTMLElement;
    expect(box.getAttribute('role')).toBe('textbox');
    expect(box.getAttribute('aria-multiline')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)?.textContent).toContain('Note');
    expect(box.querySelector('strong')?.textContent).toBe('Urgente');
    expect(h.el.querySelectorAll('lc-rich-text-editor [role="toolbar"] button').length).toBe(9);
    // Una modifica nell'area (come quella del browser) diventa Markdown.
    box.querySelector('li')!.appendChild(document.createTextNode(' e secondo'));
    box.dispatchEvent(new Event('input'));
    await h.settle();
    ([...h.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Invia')) as HTMLButtonElement).click();
    await h.until(() => h.toasts.length === 1, 'invio');
    expect(h.toasts).toEqual(['**Urgente**\n\n- primo punto e secondo']);
  });

  it('campo a sé: il valore va nello stato uscendo dall’editor; in sola lettura niente barra', async () => {
    const h = await renderScreen({
      components: [
        { type: 'input', field: { name: 'testo', type: 'richtext', label: 'Testo' } },
        { type: 'input', readOnlyIf: '{{ true }}', default: '*fisso*', field: { name: 'fisso', type: 'richtext', label: 'Fisso' } },
        { id: 'mostra', type: 'text', format: 'markdown', text: "{{ state.testo == null ? '' : state.testo }}" },
      ],
    });
    const [editable, locked] = [...h.el.querySelectorAll<HTMLElement>('lc-rich-text-editor')];
    expect(locked.querySelector('[role="toolbar"]')).toBeNull();
    expect(locked.querySelector('.area')?.getAttribute('contenteditable')).toBe('false');
    const area = editable.querySelector('.area') as HTMLElement;
    area.replaceChildren(document.createElement('ul'));
    area.firstElementChild!.appendChild(document.createElement('li')).textContent = 'voce';
    area.dispatchEvent(new Event('input'));
    await h.settle();
    expect(h.el.querySelector('[data-node-id="mostra"] li')).toBeNull();
    area.dispatchEvent(new Event('blur'));
    await h.until(() => plain(h.el.querySelector('[data-node-id="mostra"] li')?.textContent) === 'voce', 'stato');
  });
});
