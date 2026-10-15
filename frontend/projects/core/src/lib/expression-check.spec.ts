import { ExpressionEngine } from 'expressions';
import { checkScreenExpressions } from './expression-check';

const engine = new ExpressionEngine({ can: () => false });

describe('checkScreenExpressions', () => {
  it('reports nothing for valid expressions', () => {
    expect(checkScreenExpressions({ a: { visibleIf: "{{can('x.y') && row.a == 1}}" }, t: 'testo' }, engine)).toEqual([]);
  });

  it('gives the path of the wrong expressions', () => {
    const issues = checkScreenExpressions({ components: [{ visibleIf: '{{can(1)}}' }, { text: '{{non chiusa' }] }, engine);
    expect(issues.map((i) => i.path)).toEqual(['/components/0/visibleIf', '/components/1/text']);
  });
});
