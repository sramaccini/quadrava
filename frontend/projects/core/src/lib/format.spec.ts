import { formatValue } from './format';

// Intl usa spazi non separabili in italiano: si confrontano i testi senza badare al tipo di spazio.
const plain = (text: string): string => text.replace(/[  ]/g, ' ');

describe('formatValue', () => {
  it('mostra gli importi con simbolo e decimali italiani, anche se il valore arriva come testo', () => {
    expect(plain(formatValue(12500, { format: 'currency' }).text)).toBe('12.500,00 €');
    // In italiano i numeri a quattro cifre non hanno il separatore delle migliaia.
    expect(plain(formatValue(1250, { format: 'currency' }).text)).toBe('1250,00 €');
    expect(plain(formatValue('99.5', { format: 'currency' }).text)).toBe('99,50 €');
    expect(plain(formatValue(10, { format: 'currency', currency: 'USD' }).text)).toContain('10,00');
    expect(plain(formatValue(10, { format: 'currency', currency: 'USD' }).text)).toMatch(/\$|USD/);
  });

  it('mostra i numeri con i separatori della lingua e i decimali richiesti', () => {
    expect(plain(formatValue(12500.5, { format: 'number' }).text)).toBe('12.500,5');
    expect(plain(formatValue(3.14159, { format: 'number' }).text)).toBe('3,14');
    expect(plain(formatValue(2, { format: 'number', decimals: 3 }).text)).toBe('2,000');
    expect(plain(formatValue('1234567', { format: 'number', decimals: 0 }).text)).toBe('1.234.567');
    expect(formatValue(12500.5, { format: 'number' }, 'en-GB').text).toBe('12,500.5');
    expect(formatValue('n/d', { format: 'number' }).text).toBe('n/d');
  });

  it('tratta la percentuale come punti percentuali, non come frazione', () => {
    expect(plain(formatValue(10, { format: 'percent' }).text)).toBe('10 %');
    expect(plain(formatValue(12.345, { format: 'percent' }).text)).toBe('12,35 %');
  });

  it('formatta le date; una data senza ora non scivola al giorno prima', () => {
    expect(formatValue('2026-10-07', { format: 'date' }).text).toBe('07/10/26');
    expect(formatValue('2026-10-07', { format: 'datetime' }).text).toBe('07/10/26');
    expect(plain(formatValue('2026-10-07T14:30:00Z', { format: 'date' }).text)).toBe('07/10/26');
    expect(plain(formatValue('2026-10-07T14:30:00', { format: 'datetime' }).text)).toBe('07/10/26, 14:30');
  });

  it('mostra Sì e No per i booleani', () => {
    expect(formatValue(true, { format: 'boolean' }).text).toBe('Sì');
    expect(formatValue(false, { format: 'boolean' }).text).toBe('No');
    expect(formatValue('forse', { format: 'boolean' }).text).toBe('forse');
  });

  it('assegna il tono ai badge; i valori non elencati sono neutri', () => {
    const badges = { approvato: 'success', respinta: 'danger' } as const;
    expect(formatValue('approvato', { format: 'badge', badges })).toEqual({ text: 'approvato', tone: 'success' });
    expect(formatValue('bozza', { format: 'badge', badges })).toEqual({ text: 'bozza', tone: 'neutral' });
    expect(formatValue('x', { format: 'badge' })).toEqual({ text: 'x', tone: 'neutral' });
  });

  it('un nome come "constructor" non pesca proprietà ereditate dall’oggetto dei badge', () => {
    expect(formatValue('constructor', { format: 'badge', badges: { a: 'success' } }).tone).toBe('neutral');
    expect(formatValue('toString', { format: 'badge', badges: {} }).tone).toBe('neutral');
  });

  it('valori nulli diventano vuoti; valori non formattabili restano com’è e non lanciano', () => {
    expect(formatValue(null, { format: 'currency' }).text).toBe('');
    expect(formatValue(undefined, { format: 'date' }).text).toBe('');
    expect(formatValue('abc', { format: 'currency' }).text).toBe('abc');
    expect(formatValue('non una data', { format: 'date' }).text).toBe('non una data');
    expect(formatValue(NaN, { format: 'percent' }).text).toBe('NaN');
    expect(formatValue(5, { format: 'currency', currency: 'xx' }).text).toBe('5');
  });

  it('senza formato mostra il testo del valore', () => {
    expect(formatValue(42, {}).text).toBe('42');
    expect(formatValue('ciao', { format: 'text' }).text).toBe('ciao');
  });
});
