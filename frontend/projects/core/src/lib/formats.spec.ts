import { FORMAT_COUNTRIES, isAlphanumeric, isBic, isCompanyId, isEmail, isIban, isPhone, isPostalCode, isTaxCode, isUrl, isUuid, isVatNumber, luhn } from './formats';

// Samples: published examples of the algorithms (company numbers, standard IBAN examples) and synthetic personal codes.
// No real person's data.

describe('generic formats', () => {
  it('e-mail', () => {
    expect(isEmail('anna.rossi+orders@example.co.uk')).toBe(true);
    for (const bad of ['anna', 'anna@', '@example.com', 'anna@example', 'an na@example.com', 'anna@-example.com', 'a@b..com']) expect(isEmail(bad), bad).toBe(false);
    expect(isEmail('a'.repeat(65) + '@example.com')).toBe(false);
  });

  it('url: http and https only', () => {
    expect(isUrl('https://example.com/a?b=1')).toBe(true);
    expect(isUrl('http://localhost:4200')).toBe(true);
    for (const bad of ['example.com', 'javascript:alert(1)', 'ftp://example.com', 'https://exa mple.com']) expect(isUrl(bad), bad).toBe(false);
  });

  it('phone: lenient, 6 to 15 digits', () => {
    for (const ok of ['+39 06 1234 5678', '(030) 123-45-67', '+1.415.555.0100', '0612345']) expect(isPhone(ok), ok).toBe(true);
    for (const bad of ['12345', '+39 06 1234 5678 9012 3', '06 12a45678', '++39 0612345', '39+0612345']) expect(isPhone(bad), bad).toBe(false);
  });

  it('iban: country length and check digits, spaces allowed, any case', () => {
    for (const ok of ['GB82 WEST 1234 5698 7654 32', 'DE89370400440532013000', 'it60x0542811101000000123456', 'NL91ABNA0417164300']) expect(isIban(ok), ok).toBe(true);
    expect(isIban('DE89370400440532013001')).toBe(false); // check digits
    expect(isIban('DE8937040044053201300')).toBe(false); // length of the country
    expect(isIban('XX89370400440532013000')).toBe(false); // unknown country
  });

  it('bic, uuid, alphanumeric', () => {
    expect(isBic('DEUTDEFF')).toBe(true);
    expect(isBic('deutdeff500')).toBe(true);
    expect(isBic('DEUT1EFF')).toBe(false);
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('123e4567e89b12d3a456426614174000')).toBe(false);
    expect(isAlphanumeric('Abc123')).toBe(true);
    expect(isAlphanumeric('abc 123')).toBe(false);
    expect(isAlphanumeric('àbc')).toBe(false);
  });

  it('luhn', () => {
    expect(luhn('79927398713')).toBe(true);
    expect(luhn('79927398710')).toBe(false);
  });
});

describe('VAT numbers', () => {
  const valid: Record<string, string> = {
    IT: 'IT 00743110157',
    DE: 'DE 136 695 976',
    FR: 'FR 40 303 265 045',
    ES: 'ES B-58378431',
    NL: 'NL004495445B01',
    BE: 'BE 0403.019.261',
    AT: 'ATU13585627',
    PT: 'PT 501 964 843',
    PL: 'PL 856-734-62-15',
    SE: 'SE 123456789701',
  };
  /** The same numbers with one digit changed, so that the check fails. */
  const wrongDigit: Record<string, string> = {
    IT: '00743110158',
    DE: '136695977',
    FR: '41303265045',
    ES: 'B58378432',
    NL: '004495446B01',
    BE: '0403019262',
    AT: 'U13585628',
    PT: '501964844',
    PL: '8567346216',
    SE: '123456789801',
  };

  it('every supported country has a sample', () => {
    expect(Object.keys(valid).sort()).toEqual([...FORMAT_COUNTRIES.vatNumber].sort());
  });

  for (const [country, number] of Object.entries(valid)) {
    it(`${country}: accepts a valid number with or without its prefix, rejects a wrong check digit`, () => {
      expect(isVatNumber(number, country)).toBe(true);
      expect(isVatNumber(number)).toBe(true);
      const bare = number.replace(/[\s.-]/g, '').slice(2);
      expect(isVatNumber(bare, country)).toBe(true);
      expect(isVatNumber(wrongDigit[country], country), wrongDigit[country]).toBe(false);
    });
  }

  it('without a country the prefix is required', () => {
    expect(isVatNumber('00743110157')).toBe(false);
    expect(isVatNumber('XX00743110157')).toBe(false);
  });

  it('a number of another country does not pass', () => {
    expect(isVatNumber('DE136695976', 'IT')).toBe(false);
  });

  it('null for a country not supported', () => {
    expect(isVatNumber('123', 'US')).toBeNull();
  });

  it('FR: alphanumeric keys are accepted on their shape', () => {
    expect(isVatNumber('FRO1303265045', 'FR')).toBe(false); // O is not used in keys
    expect(isVatNumber('FRK7303265045', 'FR')).toBe(true);
  });
});

describe('tax codes of persons', () => {
  it('IT: codice fiscale with check character and omocodia; 11 digits too', () => {
    expect(isTaxCode('TSTPRV80A41H501E', 'IT')).toBe(true);
    expect(isTaxCode('xmplcd95t15f205g', 'IT')).toBe(true);
    expect(isTaxCode('TSTPRV80A41H5MNK', 'IT')).toBe(true); // omocodia
    expect(isTaxCode('TSTPRV80A41H501F', 'IT')).toBe(false); // check character
    expect(isTaxCode('TSTPRV80Z41H501E', 'IT')).toBe(false); // month
    expect(isTaxCode('TSTPRV80A35H501E', 'IT')).toBe(false); // day
    expect(isTaxCode('00743110157', 'IT')).toBe(true);
  });

  it('ES: DNI and NIE', () => {
    expect(isTaxCode('12345678Z', 'ES')).toBe(true);
    expect(isTaxCode('12345678-z', 'ES')).toBe(true);
    expect(isTaxCode('X1234567L', 'ES')).toBe(true);
    expect(isTaxCode('12345678A', 'ES')).toBe(false);
    expect(isTaxCode('X1234567A', 'ES')).toBe(false);
  });

  it('PT: NIF', () => {
    expect(isTaxCode('501964843', 'PT')).toBe(true);
    expect(isTaxCode('501964842', 'PT')).toBe(false);
  });

  it('NL: BSN eleven test', () => {
    expect(isTaxCode('111222333', 'NL')).toBe(true);
    expect(isTaxCode('111222334', 'NL')).toBe(false);
    expect(isTaxCode('000000000', 'NL')).toBe(false);
  });

  it('null for a country not supported', () => {
    expect(isTaxCode('123', 'DE')).toBeNull();
  });
});

describe('company numbers', () => {
  it('IT partita IVA, ES CIF, PT NIPC, BE enterprise number, NL KvK', () => {
    expect(isCompanyId('00743110157', 'IT')).toBe(true);
    expect(isCompanyId('00743110158', 'IT')).toBe(false);
    expect(isCompanyId('B58378431', 'ES')).toBe(true);
    expect(isCompanyId('B58378432', 'ES')).toBe(false);
    expect(isCompanyId('501964843', 'PT')).toBe(true);
    expect(isCompanyId('0403.019.261', 'BE')).toBe(true);
    expect(isCompanyId('0403.019.262', 'BE')).toBe(false);
    expect(isCompanyId('12345678', 'NL')).toBe(true);
    expect(isCompanyId('1234567', 'NL')).toBe(false);
  });

  it('FR SIREN and SIRET', () => {
    expect(isCompanyId('732 829 320', 'FR')).toBe(true);
    expect(isCompanyId('732 829 320 00074', 'FR')).toBe(true);
    expect(isCompanyId('732 829 321', 'FR')).toBe(false);
    expect(isCompanyId('7328293200007', 'FR')).toBe(false);
  });

  it('null for a country not supported', () => {
    expect(isCompanyId('123', 'SE')).toBeNull();
  });
});

describe('postal codes', () => {
  const samples: Record<string, [string, string]> = {
    IT: ['00184', '0018'],
    DE: ['10115', '00115'],
    FR: ['75001', '7500'],
    ES: ['28013', '53001'],
    NL: ['1012 ab', '1012 SA'],
    BE: ['1000', '0999'],
    AT: ['1010', '10100'],
    PT: ['1000-001', '1000001'],
    PL: ['00-950', '00950'],
    SE: ['113 51', '013 51'],
  };

  it('every supported country has a sample', () => {
    expect(Object.keys(samples).sort()).toEqual([...FORMAT_COUNTRIES.postalCode].sort());
  });

  for (const [country, [ok, bad]] of Object.entries(samples)) {
    it(`${country}: ${ok} yes, ${bad} no`, () => {
      expect(isPostalCode(ok, country)).toBe(true);
      expect(isPostalCode(bad, country)).toBe(false);
    });
  }

  it('null for a country not supported', () => {
    expect(isPostalCode('12345', 'US')).toBeNull();
  });
});
