import { ExpressionEngine } from 'expressions';
import { I18n, checkScreenExpressions } from 'core';
import { validateScreen } from 'schema';
import fatturaNuova from '../../public/examples/fattura-nuova.json';
import fattureElenco from '../../public/examples/fatture-elenco.json';
import ordineDettaglio from '../../public/examples/ordine-dettaglio.json';
import ordiniElenco from '../../public/examples/ordini-elenco.json';
import pacchettiElenco from '../../public/examples/pacchetti-elenco.json';
import pacchettoNuovo from '../../public/examples/pacchetto-nuovo.json';
import speseElenco from '../../public/examples/spese-elenco.json';
import vetrinaBase from '../../public/examples/vetrina-base.json';
import vetrinaForm from '../../public/examples/vetrina-form.json';
import vetrinaLayout from '../../public/examples/vetrina-layout.json';
import vetrinaTabelle from '../../public/examples/vetrina-tabelle.json';
import vetrinaTabelleAvanzate from '../../public/examples/vetrina-tabelle-avanzate.json';
import vetrinaCampi from '../../public/examples/vetrina-campi.json';
import vetrinaInput from '../../public/examples/vetrina-input.json';
import vetrinaContenitori from '../../public/examples/vetrina-contenitori.json';
import vetrinaAttivita from '../../public/examples/vetrina-attivita.json';
import vetrinaCruscotto from '../../public/examples/vetrina-cruscotto.json';
import vetrinaViste from '../../public/examples/vetrina-viste.json';
import vetrinaDatatable from '../../public/examples/vetrina-datatable.json';
import navigation from '../../public/examples/navigation.json';
import catalogEn from '../../public/examples/i18n/en.json';
import catalogIt from '../../public/examples/i18n/it.json';

const SCREENS: Record<string, unknown> = {
  'fattura-nuova': fatturaNuova,
  'fatture-elenco': fattureElenco,
  'ordine-dettaglio': ordineDettaglio,
  'ordini-elenco': ordiniElenco,
  'pacchetti-elenco': pacchettiElenco,
  'pacchetto-nuovo': pacchettoNuovo,
  'spese-elenco': speseElenco,
  'vetrina-base': vetrinaBase,
  'vetrina-form': vetrinaForm,
  'vetrina-layout': vetrinaLayout,
  'vetrina-tabelle': vetrinaTabelle,
  'vetrina-tabelle-avanzate': vetrinaTabelleAvanzate,
  'vetrina-campi': vetrinaCampi,
  'vetrina-input': vetrinaInput,
  'vetrina-contenitori': vetrinaContenitori,
  'vetrina-attivita': vetrinaAttivita,
  'vetrina-cruscotto': vetrinaCruscotto,
  'vetrina-viste': vetrinaViste,
  'vetrina-datatable': vetrinaDatatable,
};

/** Le stringhe di testo che compaiono in una schermata (etichette, titoli, messaggi…), per verificare che nessuna sia rimasta scritta in una sola lingua. */
function texts(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => texts(n, found));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (['label', 'title', 'description', 'text', 'tooltip', 'toast', 'confirm', 'message'].includes(k) && typeof v === 'string') found.push(v);
      else texts(v, found);
    }
  }
  return found;
}

describe('esempi tradotti', () => {
  const engine = new ExpressionEngine({ can: () => false });

  for (const [name, doc] of Object.entries(SCREENS)) {
    it(`${name}: schema ed espressioni valide, ogni testo passa dal catalogo`, () => {
      const result = validateScreen(doc);
      expect(result.valid).toBe(true);
      if (!result.valid) return;
      expect(checkScreenExpressions(result.value, engine)).toEqual([]);
      const untranslated = texts(doc).filter((t) => !t.includes("t('"));
      expect(untranslated).toEqual([]);
    });
  }

  it('le etichette del menu passano dal catalogo', () => {
    const labels: string[] = [];
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') {
        for (const [k, v] of Object.entries(n)) (k === 'label' && typeof v === 'string' ? labels.push(v) : walk(v));
      }
    };
    walk(navigation);
    expect(labels.filter((l) => !l.includes("t('"))).toEqual([]);
  });

  it('ogni chiave usata esiste in italiano e in inglese e i due cataloghi coincidono', () => {
    const all = JSON.stringify([...Object.values(SCREENS), navigation]);
    const used = [...all.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(100);
    for (const key of used) {
      expect(Object.keys(catalogIt), key).toContain(key);
      expect(Object.keys(catalogEn), key).toContain(key);
    }
    expect(Object.keys(catalogEn).sort()).toEqual(Object.keys(catalogIt).sort());
  });

  it('i valori di stato e di tipo hanno una traduzione in entrambe le lingue', () => {
    const i18n = new I18n();
    i18n.addMessages('it', catalogIt);
    i18n.addMessages('en', catalogEn);
    i18n.setLocale('en');
    expect(i18n.t('valori.stato.da-revisionare')).toBe('To review');
    expect(i18n.t('valori.tipo.attiva')).toBe('Sales');
  });
});
