import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { JsonHighlightDirective, renderJsonHighlight, tokenizeJson, tokenizeTemplate } from './code-highlight';

describe('JSON colouring', () => {
  it('keys, strings, numbers, literals, punctuation; {{ }} expressions apart; the text stays identical', () => {
    const text = '{\n  "title": "Hello {{ user.username }}!",\n  "n": -1.5e3, "ok": true, "x": null,\n  "l": [1, "a"]\n}';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    const of = (type: string) => tokens.filter((t) => t.type === type).map((t) => t.text);
    expect(of('key')).toEqual(['"title"', '"n"', '"ok"', '"x"', '"l"']);
    expect(of('string')).toEqual(['"Hello ', '!"', '"a"']);
    expect(of('expression')).toEqual(['{{ user.username }}']);
    expect(of('number')).toEqual(['-1.5e3', '1']);
    expect(of('literal')).toEqual(['true', 'null']);
  });

  it('invalid text (while typing): unclosed strings and stray characters break nothing', () => {
    const text = '{ "a": "unclosed\n  trueish, @, 12abc';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    expect(tokens.find((t) => t.text.startsWith('"unclosed'))?.type).toBe('string');
    expect(tokens.some((t) => t.type === 'literal')).toBe(false);
  });

  it('property texts: normal fixed text, inside {{ }} functions, variables, properties, strings, operators', () => {
    const text = "Hello {{ t('a.b', 'Text') }} and {{ has(state.x) && row.amount >= 10 || user.roles in ['x'] ? true : null }}";
    const tokens = tokenizeTemplate(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    const of = (type: string) => tokens.filter((t) => t.type === type).map((t) => t.text);
    expect(of('plain').filter((t) => t.trim())).toEqual(['Hello ', ' and ']);
    expect(of('delimiter')).toEqual(['{{', '}}', '{{', '}}']);
    expect(of('function')).toEqual(['t', 'has']);
    expect(of('variable')).toEqual(['state', 'row', 'user']);
    expect(of('property')).toEqual(['x', 'amount', 'roles']);
    expect(of('string')).toEqual(["'a.b'", "'Text'", "'x'"]);
    expect(of('number')).toEqual(['10']);
    expect(of('literal')).toEqual(['true', 'null']);
    expect(of('operator')).toEqual(['&&', '>=', '||', 'in', '?', ':']);
    // A method after the dot is a function.
    expect(tokenizeTemplate('{{ state.name.startsWith("A") }}').find((t) => t.text === 'startsWith')?.type).toBe('function');
  });

  it('property texts while being typed: unclosed braces, open strings; without braces everything is text', () => {
    const open = "{{ user.username == 'a";
    const tokens = tokenizeTemplate(open);
    expect(tokens.map((t) => t.text).join('')).toBe(open);
    expect(tokens.at(-1)).toEqual({ type: 'string', text: "'a" });
    expect(tokenizeTemplate('Only text, with (parentheses) and 3 numbers')).toEqual([{ type: 'plain', text: 'Only text, with (parentheses) and 3 numbers' }]);
  });

  it('never HTML: a text with tags stays text', () => {
    const target = document.createElement('pre');
    renderJsonHighlight(target, '{"a": "<img src=x onerror=alert(1)>"}\n');
    expect(target.querySelector('img')).toBeNull();
    expect(target.textContent).toBe('{"a": "<img src=x onerror=alert(1)>"}\n ');
    expect(target.querySelector('.ed-code-string')?.textContent).toBe('"<img src=x onerror=alert(1)>"');
  });

  it('the directive puts the coloured text behind the textarea and updates it', async () => {
    @Component({
      imports: [JsonHighlightDirective],
      template: `<div class="ed-code"><textarea [edJsonHighlight]="text()" [value]="text()"></textarea></div>`,
    })
    class Host {
      readonly text = signal('{"a": 1}');
    }
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const layer = el.querySelector('.ed-code > pre.ed-code-layer') as HTMLElement;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.nextElementSibling?.tagName).toBe('TEXTAREA');
    expect(layer.querySelector('.ed-code-number')?.textContent).toBe('1');
    fixture.componentInstance.text.set('{"a": "b"}');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(layer.querySelector('.ed-code-string')?.textContent).toBe('"b"');
  });
});
