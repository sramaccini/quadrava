import { formatMessage } from './message-format';

describe('formatMessage', () => {
  it('sostituisce i segnaposto semplici', () => {
    expect(formatMessage('Ciao {nome}, hai {n} fatture', { nome: 'Mario', n: 3 })).toBe('Ciao Mario, hai 3 fatture');
  });

  it('leaves a placeholder without a value visible', () => {
    expect(formatMessage('Ciao {nome}', {})).toBe('Ciao {nome}');
  });

  it('chooses the plural form and replaces #', () => {
    const p = '{n, plural, =0 {nessuna fattura} one {# fattura} other {# fatture}}';
    expect(formatMessage(p, { n: 0 }, 'it')).toBe('nessuna fattura');
    expect(formatMessage(p, { n: 1 }, 'it')).toBe('1 fattura');
    expect(formatMessage(p, { n: 25000 }, 'it')).toBe('25.000 fatture');
    expect(formatMessage(p, { n: 25000 }, 'en-GB')).toBe('25,000 fatture');
  });

  it('gestisce select e segnaposto dentro i plurali', () => {
    expect(formatMessage('{g, select, f {Gentile signora} other {Gentile signore}} {nome}', { g: 'f', nome: 'Rossi' })).toBe('Gentile signora Rossi');
    expect(formatMessage('{n, plural, one {# riga di {chi}} other {# righe di {chi}}}', { n: 2, chi: 'Anna' })).toBe('2 righe di Anna');
  });

  it('accepts literal braces with the backslash', () => {
    expect(formatMessage('usa \\{chiave\\}', {})).toBe('usa {chiave}');
  });

  it('does not throw on malformed messages and does not interpret HTML', () => {
    expect(formatMessage('Ciao {nome', { nome: 'x' })).toBe('Ciao {nome');
    expect(formatMessage('Ciao {nome}', { nome: '<b>x</b>' })).toBe('Ciao <b>x</b>');
  });
});
