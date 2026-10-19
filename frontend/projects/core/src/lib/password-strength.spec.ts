import { passwordStrength } from './password-strength';

// Made-up passwords only.
describe('passwordStrength', () => {
  const score = (password: string, personal: string[] = []) => passwordStrength(password, personal).score;

  it('empty and short passwords are very weak', () => {
    expect(passwordStrength('')).toEqual({ score: 0, hints: ['short'] });
    expect(score('k8#L')).toBe(0);
  });

  it('common passwords are very weak, also written with digits for letters', () => {
    for (const password of ['password', 'P@ssw0rd', 'Password1', 'qwerty123', 'letmein!', 'Summer2026!']) expect(score(password), password).toBe(0);
    expect(passwordStrength('P@ssw0rd').hints).toContain('common');
  });

  it('repetitions, sequences and years count little', () => {
    expect(score('aaaaaaaaaaaa')).toBe(0);
    expect(score('abcdefgh12345')).toBe(0);
    expect(passwordStrength('zyxw1987').hints).toEqual(expect.arrayContaining(['sequence', 'year']));
  });

  it('the values of the other fields make a password weaker', () => {
    expect(score('mario.rossi85')).toBeGreaterThan(score('mario.rossi85', ['Mario Rossi', 'mario.rossi@example.com']));
    expect(passwordStrength('mario.rossi85', ['Mario Rossi']).hints).toContain('personal');
  });

  it('long random passwords and passphrases are strong', () => {
    expect(score('k8#Lq2!vZp')).toBe(3);
    expect(score('Xr7$mQ2v!kL9pW')).toBe(4);
    expect(score('giraffe-lamp-ocean-27')).toBe(4);
    expect(passwordStrength('correcthorsebatterystaple').hints).toEqual(['classes']);
  });

  it('the score grows with the length', () => {
    const scores = ['k8#L', 'k8#Lq2', 'k8#Lq2!v', 'k8#Lq2!vZp', 'k8#Lq2!vZpXr7$'].map((p) => score(p));
    expect([...scores].sort()).toEqual(scores);
  });
});
