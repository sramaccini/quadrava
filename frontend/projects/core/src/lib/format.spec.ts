import { formatValue, valueTranslationKey } from './format';

// Intl uses non-breaking spaces in some languages (Italian): texts are compared regardless of the kind of space.
const plain = (text: string): string => text.replace(/[  ]/g, ' ');

describe('formatValue', () => {
  it('a list of texts (the tags of a row) is shown as its items separated by commas, each translated', () => {
    expect(formatValue(['bug', 'ui'], {}).text).toBe('bug, ui');
    expect(formatValue(['bug', 'ui'], { valueKey: 'labels' }, 'en-GB', { yes: 'Yes', no: 'No', translate: (key, raw) => (key === 'labels.bug' ? 'Bug' : raw) }).text).toBe('Bug, ui');
    expect(plain(formatValue([1000, 2], { format: 'number' }).text)).toBe('1,000, 2');
    expect(formatValue([], {}).text).toBe('');
  });

  it('a value that cannot be part of a key (such as *) is translated with its own key in valueKeys, before valueKey', () => {
    const translate = (key: string, raw: string): string => ({ 'values.events.all': 'Every event', 'values.events.push': 'Push' })[key] ?? raw;
    const labels = { yes: 'Yes', no: 'No', translate };
    const spec = { valueKey: 'values.events', valueKeys: { '*': 'values.events.all' } };
    expect(formatValue('*', spec, 'en-GB', labels).text).toBe('Every event');
    expect(formatValue('push', spec, 'en-GB', labels).text).toBe('Push');
    expect(formatValue(['*', 'tag'], spec, 'en-GB', labels).text).toBe('Every event, tag');
    // A missing key shows the value; the keys are own properties only.
    expect(formatValue('*', { valueKeys: { '*': 'values.missing' } }, 'en-GB', labels).text).toBe('*');
    expect(valueTranslationKey('toString', undefined, { '*': 'values.events.all' })).toBeNull();
    expect(valueTranslationKey('push', 'values.events')).toBe('values.events.push');
  });

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

  it('relative: the distance from now in the largest unit that fits, with the full date as title', () => {
    const now = Date.parse('2026-11-27T12:00:00Z');
    const rel = (value: unknown, locale = 'en-GB'): string => formatValue(value, { format: 'relative' }, locale, undefined, now).text;
    expect(rel('2026-11-27T11:59:40Z')).toBe('now');
    expect(rel('2026-11-27T11:55:00Z')).toBe('5 minutes ago');
    expect(rel('2026-11-27T09:00:00Z')).toBe('3 hours ago');
    expect(rel('2026-11-24T12:00:00Z')).toBe('3 days ago');
    expect(rel('2026-11-26T10:00:00Z')).toBe('yesterday');
    expect(rel('2026-11-29T12:00:00Z')).toBe('in 2 days');
    expect(rel('2026-09-20T12:00:00Z')).toBe('2 months ago');
    expect(rel('2024-11-01T12:00:00Z')).toBe('2 years ago');
    expect(rel('2026-11-24T12:00:00Z', 'it-IT')).toBe('3 giorni fa');
    // A date without time counts calendar days: today's date is «today», not «12 hours ago».
    expect(rel('2026-11-27')).toBe('today');
    expect(rel('2026-11-28')).toBe('tomorrow');
    const value = formatValue('2026-11-24T12:00:00Z', { format: 'relative' }, 'en-GB', undefined, now);
    expect(value.title).toMatch(/24 November 2026/);
    expect(formatValue('2026-11-27', { format: 'relative' }, 'en-GB', undefined, now).title).toBe('27 November 2026');
    // Not a date: shown as it is, without a title.
    expect(formatValue('soon', { format: 'relative' }, 'en-GB', undefined, now)).toEqual({ text: 'soon' });
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

  it('image: the address to draw and the file name as its text', () => {
    expect(formatValue('/api/files/7/plan.png', { format: 'image' })).toEqual({ text: 'plan.png', image: '/api/files/7/plan.png' });
  });

  it('without a format it shows the text of the value', () => {
    expect(formatValue(42, {}).text).toBe('42');
    expect(formatValue('ciao', { format: 'text' }).text).toBe('ciao');
  });
});
