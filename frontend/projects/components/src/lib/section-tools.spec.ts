import { TestBed } from '@angular/core/testing';
import { CodeViewComponent } from './code-view.component';
import { renderScreen } from './screen-testing';
import { SectionTools, type SectionContext } from './section.component';

describe('Section tools and code viewer', () => {
  const components = [{ id: 's', type: 'section' as const, title: 'Sample', components: [{ type: 'text' as const, text: 'x' }] }];

  it('without SectionTools the section has nothing more', async () => {
    const { el } = await renderScreen({ components });
    expect(el.querySelector('lc-section .ant-card-extra')).toBeNull();
  });

  it('with SectionTools: «JSON» and «Help» receive the section with its translated title', async () => {
    const calls: [string, SectionContext][] = [];
    const tools: SectionTools = {
      applies: ({ node }) => node.id === 's',
      showSource: (c) => calls.push(['source', c]),
      showHelp: (c) => calls.push(['help', c]),
    };
    const { el, settle } = await renderScreen({ components, extraProviders: [{ provide: SectionTools, useValue: tools }] });
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('lc-section .ant-card-extra button')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['JSON of the «Sample» section', 'Help on the components of the «Sample» section']);
    buttons[0].click();
    buttons[1].click();
    await settle();
    expect(calls.map(([kind, c]) => [kind, c.node.id, c.title])).toEqual([
      ['source', 's', 'Sample'],
      ['help', 's', 'Sample'],
    ]);
  });

  it('the viewer colours the JSON with elements and text, never HTML', async () => {
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
