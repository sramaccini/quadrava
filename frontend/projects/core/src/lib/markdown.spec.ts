import { markdownToPlain, parseInline, parseMarkdown, safeHref } from './markdown';

describe('Restricted Markdown', () => {
  it('paragraphs separated by empty lines; a line break inside a paragraph stays a line break', () => {
    expect(parseMarkdown('First line\nsecond line\n\nAnother paragraph')).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', text: 'First line' }, { kind: 'break' }, { kind: 'text', text: 'second line' }] },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Another paragraph' }] },
    ]);
  });

  it('headings, quotes, bulleted and numbered lists, also nested', () => {
    const blocks = parseMarkdown('# Titolo\n- uno\n- due\n  1. a\n  2. b\n- tre\n\n3. terzo\n4. quarto\n\n> citato\n> ancora');
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, content: [{ kind: 'text', text: 'Titolo' }] });
    expect(blocks[1]).toMatchObject({
      kind: 'list',
      ordered: false,
      items: [
        { content: [{ kind: 'text', text: 'uno' }] },
        { content: [{ kind: 'text', text: 'due' }], list: { ordered: true, start: 1, items: [{ content: [{ kind: 'text', text: 'a' }] }, { content: [{ kind: 'text', text: 'b' }] }] } },
        { content: [{ kind: 'text', text: 'tre' }] },
      ],
    });
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: true, start: 3 });
    expect(blocks[3]).toMatchObject({ kind: 'quote', blocks: [{ kind: 'paragraph' }] });
  });

  it('grassetto, corsivo, barrato, codice ed escape', () => {
    expect(parseInline('**forte** e *corsivo* e _anche_ ~~via~~ `x*y` \\*no\\*')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'forte' }] },
      { kind: 'text', text: ' e ' },
      { kind: 'em', children: [{ kind: 'text', text: 'corsivo' }] },
      { kind: 'text', text: ' e ' },
      { kind: 'em', children: [{ kind: 'text', text: 'anche' }] },
      { kind: 'text', text: ' ' },
      { kind: 'del', children: [{ kind: 'text', text: 'via' }] },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'x*y' },
      { kind: 'text', text: ' *no*' },
    ]);
    // Isolated symbols and words with underscores stay text.
    expect(parseInline('3 * 4 = 12 e nome_file_lungo')).toEqual([{ kind: 'text', text: '3 * 4 = 12 e nome_file_lungo' }]);
    expect(parseInline('***entrambi***')).toEqual([{ kind: 'strong', children: [{ kind: 'em', children: [{ kind: 'text', text: 'entrambi' }] }] }]);
  });

  it('links only to https, mailto and relative paths: the others stay text', () => {
    expect(parseInline('[Sito](https://example.com/a?b=1)')).toEqual([{ kind: 'link', href: 'https://example.com/a?b=1', external: true, children: [{ kind: 'text', text: 'Sito' }] }]);
    expect(parseInline('[Order](/orders/7)')).toEqual([{ kind: 'link', href: '/orders/7', external: false, children: [{ kind: 'text', text: 'Order' }] }]);
    for (const bad of ['javascript:alert(1)', 'http://x.test', '//evil.test', 'data:text/html,x', '/../segreto', 'JaVaScRiPt:alert(1)']) {
      expect(safeHref(bad), bad).toBeNull();
      expect(parseInline(`[x](${bad})`).every((n) => n.kind === 'text'), bad).toBe(true);
    }
    expect(safeHref('mailto:ufficio@example.com')).toBe('mailto:ufficio@example.com');
  });

  it('HTML in the text stays text; huge texts are truncated; plain text for summaries', () => {
    expect(parseMarkdown('<script>alert(1)</script> <b>no</b>')).toEqual([{ kind: 'paragraph', content: [{ kind: 'text', text: '<script>alert(1)</script> <b>no</b>' }] }]);
    expect(markdownToPlain('x'.repeat(30_000)).length).toBe(20_000);
    expect(markdownToPlain('# Titolo\n- **uno**\n- [due](https://x.it)')).toBe('Titolo\nuno\ndue');
    expect(parseMarkdown(null)).toEqual([]);
  });
});
