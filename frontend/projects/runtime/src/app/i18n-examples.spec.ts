import { ExpressionEngine } from 'expressions';
import { I18n, checkScreenExpressions } from 'core';
import { validateScreen } from 'schema';
import fatturaNuova from '../../public/examples/invoice-new.json';
import fattureElenco from '../../public/examples/invoice-list.json';
import ordineDettaglio from '../../public/examples/order-detail.json';
import ordiniElenco from '../../public/examples/order-list.json';
import pacchettiElenco from '../../public/examples/package-list.json';
import pacchettoNuovo from '../../public/examples/package-new.json';
import speseElenco from '../../public/examples/expense-list.json';
import vetrinaBase from '../../public/examples/showcase-basics.json';
import vetrinaForm from '../../public/examples/showcase-form.json';
import vetrinaLayout from '../../public/examples/showcase-layout.json';
import vetrinaTabelle from '../../public/examples/showcase-tables.json';
import vetrinaTabelleAvanzate from '../../public/examples/showcase-advanced-tables.json';
import vetrinaCampi from '../../public/examples/showcase-fields.json';
import vetrinaInput from '../../public/examples/showcase-input.json';
import vetrinaContenitori from '../../public/examples/showcase-containers.json';
import vetrinaAttivita from '../../public/examples/showcase-tasks.json';
import vetrinaCruscotto from '../../public/examples/showcase-dashboard.json';
import vetrinaViste from '../../public/examples/showcase-views.json';
import vetrinaDatatable from '../../public/examples/showcase-datatable.json';
import navigation from '../../public/examples/navigation.json';
import catalogEn from '../../public/examples/i18n/en.json';
import catalogIt from '../../public/examples/i18n/it.json';

const SCREENS: Record<string, unknown> = {
  'invoice-new': fatturaNuova,
  'invoice-list': fattureElenco,
  'order-detail': ordineDettaglio,
  'order-list': ordiniElenco,
  'package-list': pacchettiElenco,
  'package-new': pacchettoNuovo,
  'expense-list': speseElenco,
  'showcase-basics': vetrinaBase,
  'showcase-form': vetrinaForm,
  'showcase-layout': vetrinaLayout,
  'showcase-tables': vetrinaTabelle,
  'showcase-advanced-tables': vetrinaTabelleAvanzate,
  'showcase-fields': vetrinaCampi,
  'showcase-input': vetrinaInput,
  'showcase-containers': vetrinaContenitori,
  'showcase-tasks': vetrinaAttivita,
  'showcase-dashboard': vetrinaCruscotto,
  'showcase-views': vetrinaViste,
  'showcase-datatable': vetrinaDatatable,
};

/** The text strings appearing in a screen (labels, titles, messages…), to check that none was left written in a single language. */
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

describe('translated examples', () => {
  const engine = new ExpressionEngine({ can: () => false });

  for (const [name, doc] of Object.entries(SCREENS)) {
    it(`${name}: valid schema and expressions, every text goes through the catalogue`, () => {
      const result = validateScreen(doc);
      expect(result.valid).toBe(true);
      if (!result.valid) return;
      expect(checkScreenExpressions(result.value, engine)).toEqual([]);
      // A text made only of data (no hand-written string, for example {{ state.description }}) has nothing to translate.
      const untranslated = texts(doc).filter((t) => !t.includes("t('") && !/^{{[^'"]*}}$/.test(t.trim()));
      expect(untranslated).toEqual([]);
    });
  }

  it('the menu labels go through the catalogue', () => {
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

  it('every key used exists in Italian and in English and the two catalogues match', () => {
    const all = JSON.stringify([...Object.values(SCREENS), navigation]);
    const used = [...all.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(100);
    for (const key of used) {
      expect(Object.keys(catalogIt), key).toContain(key);
      expect(Object.keys(catalogEn), key).toContain(key);
    }
    expect(Object.keys(catalogEn).sort()).toEqual(Object.keys(catalogIt).sort());
  });

  it('status and type values have a translation in both languages', () => {
    const i18n = new I18n();
    i18n.addMessages('it', catalogIt);
    i18n.addMessages('en', catalogEn);
    i18n.setLocale('en');
    expect(i18n.t('values.status.to-review')).toBe('To review');
    expect(i18n.t('values.type.sales')).toBe('Sales');
  });
});
