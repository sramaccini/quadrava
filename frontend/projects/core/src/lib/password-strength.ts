/**
 * Strength of a password: a light estimate of our own (ADR-15), not a dictionary attack simulator. The length that counts
 * is what is left after discounting what an attacker tries first (repeated characters, sequences, keyboard rows, years,
 * common words and passwords, also written with digits for letters, and the values of the other fields of the form);
 * that length times the bits of the kinds of characters used gives a score from 0 (very weak) to 4 (strong).
 * Pure: the password never leaves the function.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

/** Why a password is weaker than its length suggests, as hints to show (`lc.strength.hint.<name>`). */
export type StrengthHint = 'short' | 'classes' | 'repeated' | 'sequence' | 'year' | 'common' | 'personal';

export interface PasswordStrength {
  score: StrengthScore;
  hints: StrengthHint[];
}

/** Common passwords and words people build passwords from (lower case, without digits for letters). */
const COMMON = [
  'password', 'passwort', 'motdepasse', 'contrasena', 'parola', 'qwerty', 'azerty', 'qwertz', 'letmein', 'welcome',
  'benvenuto', 'willkommen', 'bienvenue', 'admin', 'administrator', 'root', 'login', 'master', 'secret', 'iloveyou',
  'ciao', 'hello', 'dragon', 'monkey', 'football', 'calcio', 'baseball', 'soccer', 'shadow', 'sunshine', 'princess',
  'superman', 'batman', 'starwars', 'trustno', 'freedom', 'whatever', 'computer', 'internet', 'summer', 'winter',
  'spring', 'autumn', 'estate', 'inverno', 'primavera', 'autunno', 'sommer', 'january', 'february', 'march', 'april',
  'june', 'july', 'august', 'september', 'october', 'november', 'december', 'gennaio', 'febbraio', 'marzo', 'aprile',
  'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'dicembre', 'love', 'amore', 'test', 'user', 'guest',
  'changeme', 'default', 'company', 'office', 'access', 'pass', 'abc', 'asdf', 'zxcv', 'quadrava',
].sort((a, b) => b.length - a.length);

/** Keyboard rows and alphabets in which neighbouring characters form a sequence. */
const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'azertyuiop', 'qwertzuiop'];

/** Digits and symbols written for letters (p4ssw0rd). */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't' };

function charsetBits(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/\d/.test(password)) size += 10;
  if (/[^A-Za-z0-9]/u.test(password.replace(/[^\x20-\x7e]/g, ''))) size += 33;
  if (/[^\x00-\x7f]/.test(password)) size += 100;
  return Math.log2(Math.max(size, 1));
}

/** Characters of the text covered by the ranges found, as a mask. */
function mark(mask: boolean[], from: number, length: number): void {
  for (let i = from; i < from + length && i < mask.length; i++) mask[i] = true;
}

/**
 * The estimate. `personal` are the values of the other fields (a name, an e-mail): parts of them inside the password
 * count as if they were not there.
 */
export function passwordStrength(password: string, personal: readonly string[] = []): PasswordStrength {
  const chars = password.split('');
  const length = chars.length;
  if (length === 0) return { score: 0, hints: ['short'] };
  const hints = new Set<StrengthHint>();
  const lower = password.toLowerCase();
  const plain = lower.replace(/./g, (c) => LEET[c] ?? c);
  // Characters that are «free» for an attacker; each covered range still counts for one character.
  const covered: boolean[] = new Array(length).fill(false);
  let extra = 0;
  const cover = (from: number, size: number, hint: StrengthHint): void => {
    if (covered.slice(from, from + size).every(Boolean)) return;
    mark(covered, from, size);
    extra += 1;
    hints.add(hint);
  };

  // Repeated characters: aaaa, 1111.
  for (let i = 0; i < length; ) {
    let j = i + 1;
    while (j < length && chars[j] === chars[i]) j++;
    if (j - i >= 3) cover(i, j - i, 'repeated');
    i = j;
  }
  // Sequences of at least three neighbours, in either direction: abc, 4321, qwer.
  for (const row of SEQUENCES) {
    for (const text of [row, [...row].reverse().join('')]) {
      for (let i = 0; i < length - 2; i++) {
        let j = i;
        while (j < length - 1 && text.indexOf(lower[j] + lower[j + 1]) >= 0) j++;
        if (j - i >= 2) {
          cover(i, j - i + 1, 'sequence');
          i = j;
        }
      }
    }
  }
  // Years from 1900 to 2099.
  for (const match of lower.matchAll(/(19|20)\d\d/g)) cover(match.index, 4, 'year');
  // Common words and passwords, also with digits for letters.
  for (const word of COMMON) {
    for (const text of [lower, plain]) {
      let at = text.indexOf(word);
      while (at >= 0) {
        cover(at, word.length, 'common');
        at = text.indexOf(word, at + word.length);
      }
    }
  }
  // Values of the other fields, and their words (the parts of an e-mail, of a name) of at least three characters.
  const parts = personal.flatMap((p) => [p, ...p.split(/[\s@._-]+/)]).map((p) => p.toLowerCase()).filter((p) => p.length >= 3);
  for (const part of [...new Set(parts)].sort((a, b) => b.length - a.length)) {
    let at = lower.indexOf(part);
    while (at >= 0) {
      cover(at, part.length, 'personal');
      at = lower.indexOf(part, at + part.length);
    }
  }

  const effective = covered.filter((c) => !c).length + extra;
  const bits = effective * charsetBits(password);
  const score: StrengthScore = bits < 28 ? 0 : bits < 40 ? 1 : bits < 56 ? 2 : bits < 72 ? 3 : 4;
  if (length < 10) hints.add('short');
  if (charsetBits(password) < Math.log2(62)) hints.add('classes');
  return { score: hints.has('common') && covered.every(Boolean) ? 0 : score, hints: [...hints] };
}
