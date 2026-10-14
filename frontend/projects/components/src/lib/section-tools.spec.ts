import { TestBed } from '@angular/core/testing';
import { CodeViewComponent } from './code-view.component';
import { renderScreen } from './screen-testing';
import { SectionTools, type SectionContext } from './section.component';

describe('Strumenti delle sezioni e visore del codice', () => {
  const components = [{ id: 's', type: 'section' as const, title: 'Prova', components: [{ type: 'text' as const, text: 'x' }] }];

  it('senza SectionTools la sezione non ha nulla in più', async () => {
    const { el } = await renderScreen({ components });
    expect(el.querySelector('lc-section .ant-card-extra')).toBeNull();
  });

  it('con SectionTools: «JSON» e «Aiuto» ricevono la sezione con il titolo tradotto', async () => {
    const calls: [string, SectionContext][] = [];
    const tools: SectionTools = {
      applies: ({ node }) => node.id === 's',
      showSource: (c) => calls.push(['source', c]),
      showHelp: (c) => calls.push(['help', c]),
    };
    const { el, settle } = await renderScreen({ components, extraProviders: [{ provide: SectionTools, useValue: tools }] });
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('lc-section .ant-card-extra button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['JSON della sezione «Prova»', 'Aiuto sui componenti della sezione «Prova»']);
    buttons[0].click();
    buttons[1].click();
    await settle();
    expect(calls.map(([kind, c]) => [kind, c.node.id, c.title])).toEqual([
      ['source', 's', 'Prova'],
      ['help', 's', 'Prova'],
    ]);
  });

  it('il visore colora il JSON con elementi e testo, mai HTML', async () => {
    const fixture = TestBed.createComponent(CodeViewComponent);
    fixture.componentRef.setInput('code', JSON.stringify({ a: '<img src=x onerror=alert(1)>', b: '{{ state.n }}', c: 1, d: true }, null, 2));
    fixture.detectChanges();
    await fixture.whenStable();
    const pre = (fixture.nativeElement as HTMLElement).querySelector('pre')!;
    expect(pre.querySelector('img')).toBeNull();
    expect([...pre.querySelectorAll('span')].map((s) => [s.className, s.textContent]).filter(([c]) => c !== 'lc-code-punctuation')).toEqual([
      ['lc-code-key', '"a"'],
      ['lc-code-string', '"<img src=x onerror=alert(1)>"'],
      ['lc-code-key', '"b"'],
      ['lc-code-string', '"'],
      ['lc-code-expression', '{{ state.n }}'],
      ['lc-code-string', '"'],
      ['lc-code-key', '"c"'],
      ['lc-code-number', '1'],
      ['lc-code-key', '"d"'],
      ['lc-code-literal', 'true'],
    ]);
  });
});
