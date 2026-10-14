import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { JsonHighlightDirective, renderJsonHighlight, tokenizeJson, tokenizeTemplate } from './code-highlight';

describe('colorazione del JSON', () => {
  it('chiavi, stringhe, numeri, letterali, punteggiatura; le espressioni {{ }} a parte; il testo resta identico', () => {
    const text = '{\n  "titolo": "Ciao {{ user.username }}!",\n  "n": -1.5e3, "ok": true, "x": null,\n  "l": [1, "a"]\n}';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    const of = (type: string) => tokens.filter((t) => t.type === type).map((t) => t.text);
    expect(of('key')).toEqual(['"titolo"', '"n"', '"ok"', '"x"', '"l"']);
    expect(of('string')).toEqual(['"Ciao ', '!"', '"a"']);
    expect(of('expression')).toEqual(['{{ user.username }}']);
    expect(of('number')).toEqual(['-1.5e3', '1']);
    expect(of('literal')).toEqual(['true', 'null']);
  });

  it('testo non valido (mentre si scrive): stringhe non chiuse e caratteri estranei non rompono nulla', () => {
    const text = '{ "a": "non chiusa\n  trueish, @, 12abc';
    const tokens = tokenizeJson(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    expect(tokens.find((t) => t.text.startsWith('"non'))?.type).toBe('string');
    expect(tokens.some((t) => t.type === 'literal')).toBe(false);
  });

  it('testi delle proprietà: testo fisso normale, dentro {{ }} funzioni, variabili, proprietà, stringhe, operatori', () => {
    const text = "Ciao {{ t('a.b', 'Testo') }} e {{ has(state.x) && row.importo >= 10 || user.roles in ['x'] ? true : null }}";
    const tokens = tokenizeTemplate(text);
    expect(tokens.map((t) => t.text).join('')).toBe(text);
    const of = (type: string) => tokens.filter((t) => t.type === type).map((t) => t.text);
    expect(of('plain').filter((t) => t.trim())).toEqual(['Ciao ', ' e ']);
    expect(of('delimiter')).toEqual(['{{', '}}', '{{', '}}']);
    expect(of('function')).toEqual(['t', 'has']);
    expect(of('variable')).toEqual(['state', 'row', 'user']);
    expect(of('property')).toEqual(['x', 'importo', 'roles']);
    expect(of('string')).toEqual(["'a.b'", "'Testo'", "'x'"]);
    expect(of('number')).toEqual(['10']);
    expect(of('literal')).toEqual(['true', 'null']);
    expect(of('operator')).toEqual(['&&', '>=', '||', 'in', '?', ':']);
    // Un metodo dopo il punto è una funzione.
    expect(tokenizeTemplate('{{ state.nome.startsWith("A") }}').find((t) => t.text === 'startsWith')?.type).toBe('function');
  });

  it('testi delle proprietà mentre si scrivono: graffe non chiuse, stringhe aperte; senza graffe tutto testo', () => {
    const open = "{{ user.username == 'a";
    const tokens = tokenizeTemplate(open);
    expect(tokens.map((t) => t.text).join('')).toBe(open);
    expect(tokens.at(-1)).toEqual({ type: 'string', text: "'a" });
    expect(tokenizeTemplate('Solo testo, con (parentesi) e 3 numeri')).toEqual([{ type: 'plain', text: 'Solo testo, con (parentesi) e 3 numeri' }]);
  });

  it('mai HTML: un testo con tag resta testo', () => {
    const target = document.createElement('pre');
    renderJsonHighlight(target, '{"a": "<img src=x onerror=alert(1)>"}\n');
    expect(target.querySelector('img')).toBeNull();
    expect(target.textContent).toBe('{"a": "<img src=x onerror=alert(1)>"}\n ');
    expect(target.querySelector('.ed-code-string')?.textContent).toBe('"<img src=x onerror=alert(1)>"');
  });

  it('la direttiva mette il testo colorato dietro la textarea e lo aggiorna', async () => {
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
