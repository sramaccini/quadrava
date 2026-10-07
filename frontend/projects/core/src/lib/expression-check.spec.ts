import { ExpressionEngine } from 'expressions';
import { checkScreenExpressions } from './expression-check';

const engine = new ExpressionEngine({ can: () => false });

describe('checkScreenExpressions', () => {
  it('non segnala nulla per espressioni valide', () => {
    expect(checkScreenExpressions({ a: { visibleIf: "{{can('x.y') && row.a == 1}}" }, t: 'testo' }, engine)).toEqual([]);
  });

  it('indica il percorso delle espressioni errate', () => {
    const issues = checkScreenExpressions({ components: [{ visibleIf: '{{can(1)}}' }, { text: '{{non chiusa' }] }, engine);
    expect(issues.map((i) => i.path)).toEqual(['/components/0/visibleIf', '/components/1/text']);
  });
});
