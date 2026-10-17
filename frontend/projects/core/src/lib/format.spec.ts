import { formatValue } from './format';

// Intl uses non-breaking spaces in some languages (Italian): texts are compared regardless of the kind of space.
const plain = (text: string): string => text.replace(/[  ]/g, ' ');

describe('formatValue', () => {
  it('by default formats in British English: amounts, numbers, percentages, dates and Yes/No', () => {
    expect(plain(formatValue(12500, { format: 'currency' }).text)).toBe('€12,500.00');
    expect(plain(formatValue(12500.5, { format: 'number' }).text)).toBe('12,500.5');
    expect(plain(formatValue(12.345, { format: 'percent' }).text)).toBe('12.35 %');
    expect(formatValue('2026-10-07', { format: 'date' }).text).toBe('07/10/2026');
    expect(formatValue(true, { format: 'boolean' }).text).toBe('Yes');
  });

  it('shows amounts with symbol and Italian decimals, even if the value arrives as text', () => {
    expect(plain(formatValue(12500, { format: 'currency' }, 'it-IT').text)).toBe('12.500,00 €');
    // In Italian four-digit numbers have no thousands separator.
    expect(plain(formatValue(1250, { format: 'currency' }, 'it-IT').text)).toBe('1250,00 €');
    expect(plain(formatValue('99.5', { format: 'currency' }, 'it-IT').text)).toBe('99,50 €');
    expect(plain(formatValue(10, { format: 'currency', currency: 'USD' }, 'it-IT').text)).toContain('10,00');
    expect(plain(formatValue(10, { format: 'currency', currency: 'USD' }, 'it-IT').text)).toMatch(/$|USD/);
  });

  it('shows numbers with the separators of the language and the requested decimals', () => {
    expect(plain(formatValue(12500.5, { format: 'number' }, 'it-IT').text)).toBe('12.500,5');
    expect(plain(formatValue(3.14159, { format: 'number' }, 'it-IT').text)).toBe('3,14');
    expect(plain(formatValue(2, { format: 'number', decimals: 3 }, 'it-IT').text)).toBe('2,000');
    expect(plain(formatValue('1234567', { format: 'number', decimals: 0 }, 'it-IT').text)).toBe('1.234.567');
    expect(formatValue(12500.5, { format: 'number' }, 'en-GB').text).toBe('12,500.5');
    expect(formatValue('n/d', { format: 'number' }).text).toBe('n/d');
  });

  it('treats the percentage as percentage points, not as a fraction', () => {
    expect(plain(formatValue(10, { format: 'percent' }, 'it-IT').text)).toBe('10 %');
    expect(plain(formatValue(12.345, { format: 'percent' }, 'it-IT').text)).toBe('12,35 %');
  });

  it('formats dates; a date without time does not slip to the day before', () => {
    expect(formatValue('2026-10-07', { format: 'date' }, 'it-IT').text).toBe('07/10/26');
    expect(formatValue('2026-10-07', { format: 'datetime' }, 'it-IT').text).toBe('07/10/26');
    expect(plain(formatValue('2026-10-07T14:30:00Z', { format: 'date' }, 'it-IT').text)).toBe('07/10/26');
    expect(plain(formatValue('2026-10-07T14:30:00', { format: 'datetime' }, 'it-IT').text)).toBe('07/10/26, 14:30');
  });

  it('shows the labels given for booleans (Yes and No by default)', () => {
    expect(formatValue(true, { format: 'boolean' }, 'it-IT', { yes: 'Sì', no: 'No' }).text).toBe('Sì');
    expect(formatValue(false, { format: 'boolean' }).text).toBe('No');
    expect(formatValue('maybe', { format: 'boolean' }).text).toBe('maybe');
  });

  it('assigns the tone to badges; values not listed are neutral', () => {
    const badges = { approved: 'success', rejected: 'danger' } as const;
    expect(formatValue('approved', { format: 'badge', badges })).toEqual({ text: 'approved', tone: 'success' });
    expect(formatValue('draft', { format: 'badge', badges })).toEqual({ text: 'draft', tone: 'neutral' });
    expect(formatValue('x', { format: 'badge' })).toEqual({ text: 'x', tone: 'neutral' });
  });

  it('a name such as "constructor" does not pick inherited properties of the badges object', () => {
    expect(formatValue('constructor', { format: 'badge', badges: { a: 'success' } }).tone).toBe('neutral');
    expect(formatValue('toString', { format: 'badge', badges: {} }).tone).toBe('neutral');
  });

  it('null values become empty; values that cannot be formatted stay as they are and do not throw', () => {
    expect(formatValue(null, { format: 'currency' }).text).toBe('');
    expect(formatValue(undefined, { format: 'date' }).text).toBe('');
    expect(formatValue('abc', { format: 'currency' }).text).toBe('abc');
    expect(formatValue('not a date', { format: 'date' }).text).toBe('not a date');
    expect(formatValue(NaN, { format: 'percent' }).text).toBe('NaN');
    expect(formatValue(5, { format: 'currency', currency: 'xx' }).text).toBe('5');
  });

  it('without a format it shows the text of the value', () => {
    expect(formatValue(42, {}).text).toBe('42');
    expect(formatValue('ciao', { format: 'text' }).text).toBe('ciao');
  });
});
