/**
 * Checks of the built-in formats: pure functions on a text, with the check digits where a public algorithm exists.
 * Formats are case-insensitive and accept the usual separators (spaces, dots, dashes) where people write them.
 * The national checks return `null` for a country they do not support, so that the caller can fail closed.
 */

/** Countries of every national format. */
export const FORMAT_COUNTRIES = {
  vatNumber: ['IT', 'DE', 'FR', 'ES', 'NL', 'BE', 'AT', 'PT', 'PL', 'SE'],
  taxCode: ['IT', 'ES', 'PT', 'NL'],
  companyId: ['IT', 'FR', 'ES', 'PT', 'BE', 'NL'],
  postalCode: ['IT', 'DE', 'FR', 'ES', 'NL', 'BE', 'AT', 'PT', 'PL', 'SE'],
} as const;

/** Upper-case text without spaces, dots, dashes and slashes. */
function compact(value: string): string {
  return value.replace(/[\s./-]/g, '').toUpperCase();
}

const digitsOf = (text: string): number[] => [...text].map(Number);

/** Luhn check (credit cards, partita IVA, SIREN, SIRET, Swedish numbers). */
export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  [...digits].reverse().forEach((c, i) => {
    let d = Number(c);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  });
  return sum % 10 === 0;
}

/** Remainder modulo 97 of a long string of digits and letters (A = 10 … Z = 35), as for IBAN. */
function mod97(text: string): number {
  let rest = 0;
  for (const c of text) {
    const n = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of n) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest;
}

// Generic formats

/** E-mail address as in the HTML specification, with a dot in the domain; at most 254 characters. */
export function isEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(value)
  );
}

/** Web address with http or https and a host. */
export function isUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Telephone number, lenient: an optional leading +, digits, spaces, dots, dashes and brackets; 6 to 15 digits (E.164). */
export function isPhone(value: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, '').length;
  return digits >= 6 && digits <= 15;
}

/** Length of the IBAN of every country of the SWIFT registry. */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28,
  CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HN: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
  LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28,
  NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18, SE: 24,
  SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

/** IBAN: known country, its length and the check digits (mod 97). Spaces are allowed. */
export function isIban(value: string): boolean {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) || IBAN_LENGTHS[iban.slice(0, 2)] !== iban.length) return false;
  return mod97(iban.slice(4) + iban.slice(0, 4)) === 1;
}

/** BIC (SWIFT code): bank, country, place and an optional branch. */
export function isBic(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value.trim().toUpperCase());
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Letters A-Z (either case) and digits only. */
export function isAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value);
}

// National checks, shared by several formats

/** Italian codice fiscale of a person: 16 characters, with omocodia and check character. */
function italianPersonalCode(code: string): boolean {
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(code)) return false;
  // Omocodia: letters standing for digits in the numeric positions.
  const digit = (c: string): string => (/\d/.test(c) ? c : String('LMNPQRSTUV'.indexOf(c)));
  const day = Number(digit(code[9]) + digit(code[10]));
  if (!((day >= 1 && day <= 31) || (day >= 41 && day <= 71))) return false;
  const odd = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = code[i];
    const n = /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
    sum += i % 2 === 0 ? odd[n] : n;
  }
  return String.fromCharCode(65 + (sum % 26)) === code[15];
}

/** Italian partita IVA (also the codice fiscale of companies): 11 digits with the Luhn check. */
function italianVat(code: string): boolean {
  return /^\d{11}$/.test(code) && code !== '00000000000' && luhn(code);
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** Spanish NIF of a person: DNI (8 digits and letter), NIE (X, Y or Z, 7 digits and letter) or K, L, M (7 digits and letter). */
function spanishPersonalCode(code: string): boolean {
  const dni = /^(\d{8})([A-Z])$/.exec(code);
  if (dni) return DNI_LETTERS[Number(dni[1]) % 23] === dni[2];
  const nie = /^([XYZ])(\d{7})([A-Z])$/.exec(code);
  if (nie) return DNI_LETTERS[Number('XYZ'.indexOf(nie[1]) + nie[2]) % 23] === nie[3];
  const klm = /^[KLM](\d{7})([A-Z])$/.exec(code);
  return !!klm && DNI_LETTERS[Number(klm[1]) % 23] === klm[2];
}

/** Spanish CIF of a company: organisation letter, 7 digits and a control that is a digit or a letter (or either, by organisation). */
function spanishCompanyCode(code: string): boolean {
  const match = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(code);
  if (!match) return false;
  const [, kind, body, control] = match;
  let sum = 0;
  digitsOf(body).forEach((d, i) => {
    if (i % 2 === 1) sum += d;
    else sum += Math.floor((d * 2) / 10) + ((d * 2) % 10);
  });
  const c = (10 - (sum % 10)) % 10;
  const letter = 'JABCDEFGHI'[c];
  if ('PQRSNW'.includes(kind)) return control === letter;
  if ('ABEH'.includes(kind)) return control === String(c);
  return control === letter || control === String(c);
}

/** Portuguese NIF / NIPC: 9 digits, weights 9 to 2 and a mod 11 check digit. */
function portugueseCode(code: string): boolean {
  if (!/^[1-9]\d{8}$/.test(code)) return false;
  const d = digitsOf(code);
  const sum = d.slice(0, 8).reduce((s, n, i) => s + n * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === d[8];
}

/** Dutch eleven test (BSN, RSIN): weights 9 to 2, and -1 for the last digit. */
function dutchElevenTest(code: string): boolean {
  if (!/^\d{9}$/.test(code)) return false;
  const d = digitsOf(code);
  const sum = d.slice(0, 8).reduce((s, n, i) => s + n * (9 - i), 0) - d[8];
  return sum % 11 === 0 && sum !== 0;
}

/** Belgian enterprise number: 10 digits starting with 0 or 1 (9 digits are the old form), with a mod 97 check. */
function belgianCompanyCode(code: string): boolean {
  const number = code.length === 9 ? '0' + code : code;
  if (!/^[01]\d{9}$/.test(number)) return false;
  return 97 - (Number(number.slice(0, 8)) % 97) === Number(number.slice(8));
}

/** French SIREN (9 digits) or SIRET (14 digits) with the Luhn check; La Poste's establishments use the sum of the digits. */
function frenchCompanyCode(code: string): boolean {
  if (!/^(\d{9}|\d{14})$/.test(code)) return false;
  if (code.length === 14 && code.startsWith('356000000') && code !== '35600000000048') {
    return digitsOf(code).reduce((s, n) => s + n, 0) % 5 === 0;
  }
  return luhn(code);
}

// VAT numbers

/** VAT check by country, on the number without the country prefix. */
const VAT: Record<string, (n: string) => boolean> = {
  IT: italianVat,
  DE: (n) => {
    if (!/^[1-9]\d{8}$/.test(n)) return false;
    // ISO 7064, MOD 11-10.
    let product = 10;
    for (const d of digitsOf(n.slice(0, 8))) {
      let sum = (d + product) % 10;
      if (sum === 0) sum = 10;
      product = (2 * sum) % 11;
    }
    const check = 11 - product;
    return (check === 10 ? 0 : check) === Number(n[8]);
  },
  FR: (n) => {
    const match = /^([0-9A-HJ-NP-Z]{2})(\d{9})$/.exec(n);
    if (!match) return false;
    const [, key, siren] = match;
    // Numeric keys have a published check; the newer alphanumeric ones are accepted on their shape.
    return /^\d{2}$/.test(key) ? Number(key) === (12 + 3 * (Number(siren) % 97)) % 97 : true;
  },
  ES: (n) => spanishPersonalCode(n) || spanishCompanyCode(n),
  NL: (n) => /^\d{9}B\d{2}$/.test(n) && (mod97('NL' + n) === 1 || dutchElevenTest(n.slice(0, 9))),
  BE: belgianCompanyCode,
  AT: (n) => {
    const match = /^U(\d{8})$/.exec(n);
    if (!match) return false;
    const d = digitsOf(match[1]);
    const sum = d.slice(0, 7).reduce((s, n, i) => s + (i % 2 === 0 ? n : Math.floor((n * 2) / 10) + ((n * 2) % 10)), 0);
    return (10 - ((sum + 4) % 10)) % 10 === d[7];
  },
  PT: portugueseCode,
  PL: (n) => {
    if (!/^\d{10}$/.test(n)) return false;
    const d = digitsOf(n);
    const sum = [6, 5, 7, 2, 3, 4, 5, 6, 7].reduce((s, w, i) => s + w * d[i], 0) % 11;
    return sum !== 10 && sum === d[9];
  },
  SE: (n) => /^\d{10}01$/.test(n) && luhn(n.slice(0, 10)),
};

/**
 * VAT number of a country, with or without its prefix (DE136695976 or 136695976). Without a country the prefix is
 * required and decides the country. Null for a country not supported.
 */
export function isVatNumber(value: string, country?: string): boolean | null {
  const number = compact(value);
  const prefix = number.slice(0, 2);
  if (!country) return /^[A-Z]{2}$/.test(prefix) && VAT[prefix] ? VAT[prefix](number.slice(2)) : false;
  const check = VAT[country];
  if (!check) return null;
  return check(number.startsWith(country) ? number.slice(2) : number);
}

/** Personal tax number of a country. Null for a country not supported. */
export function isTaxCode(value: string, country: string): boolean | null {
  const code = compact(value);
  switch (country) {
    case 'IT':
      return italianPersonalCode(code) || italianVat(code);
    case 'ES':
      return spanishPersonalCode(code);
    case 'PT':
      return portugueseCode(code);
    case 'NL':
      return dutchElevenTest(code);
    default:
      return null;
  }
}

/** Company registration number of a country. Null for a country not supported. */
export function isCompanyId(value: string, country: string): boolean | null {
  const code = compact(value);
  switch (country) {
    case 'IT':
      return italianVat(code);
    case 'FR':
      return frenchCompanyCode(code);
    case 'ES':
      return spanishCompanyCode(code);
    case 'PT':
      return portugueseCode(code);
    case 'BE':
      return belgianCompanyCode(code);
    case 'NL':
      return /^\d{8}$/.test(code);
    default:
      return null;
  }
}

const POSTAL_CODES: Record<string, RegExp> = {
  IT: /^\d{5}$/,
  DE: /^(?!00)\d{5}$/,
  FR: /^(?!00)\d{5}$/,
  ES: /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/,
  NL: /^[1-9]\d{3} ?(?!SA|SD|SS)[A-Z]{2}$/,
  BE: /^[1-9]\d{3}$/,
  AT: /^[1-9]\d{3}$/,
  PT: /^[1-9]\d{3}-\d{3}$/,
  PL: /^\d{2}-\d{3}$/,
  SE: /^[1-9]\d{2} ?\d{2}$/,
};

/** Postal code of a country, as it is written there (1234 AB, 1000-001, 113 51). Null for a country not supported. */
export function isPostalCode(value: string, country: string): boolean | null {
  const pattern = POSTAL_CODES[country];
  return pattern ? pattern.test(value.trim().toUpperCase()) : null;
}
