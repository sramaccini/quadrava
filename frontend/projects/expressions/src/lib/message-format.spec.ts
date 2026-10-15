import { formatMessage } from './message-format';

describe('formatMessage', () => {
  it('replaces simple placeholders', () => {
    expect(formatMessage('Hello {name}, you have {n} invoices', { name: 'Mario', n: 3 })).toBe('Hello Mario, you have 3 invoices');
  });

  it('leaves a placeholder without a value visible', () => {
    expect(formatMessage('Hello {name}', {})).toBe('Hello {name}');
  });

  it('chooses the plural form and replaces #', () => {
    const p = '{n, plural, =0 {no invoices} one {# invoice} other {# invoices}}';
    expect(formatMessage(p, { n: 0 }, 'it')).toBe('no invoices');
    expect(formatMessage(p, { n: 1 }, 'it')).toBe('1 invoice');
    expect(formatMessage(p, { n: 25000 }, 'it')).toBe('25.000 invoices');
    expect(formatMessage(p, { n: 25000 }, 'en-GB')).toBe('25,000 invoices');
  });

  it('handles select and placeholders inside plurals', () => {
    expect(formatMessage('{g, select, f {Dear Ms} other {Dear Mr}} {name}', { g: 'f', name: 'Smith' })).toBe('Dear Ms Smith');
    expect(formatMessage('{n, plural, one {# row of {who}} other {# rows of {who}}}', { n: 2, who: 'Anna' })).toBe('2 rows of Anna');
  });

  it('accepts literal braces with the backslash', () => {
    expect(formatMessage('use \\{key\\}', {})).toBe('use {key}');
  });

  it('does not throw on malformed messages and does not interpret HTML', () => {
    expect(formatMessage('Hello {name', { name: 'x' })).toBe('Hello {name');
    expect(formatMessage('Hello {name}', { name: '<b>x</b>' })).toBe('Hello <b>x</b>');
  });
});
