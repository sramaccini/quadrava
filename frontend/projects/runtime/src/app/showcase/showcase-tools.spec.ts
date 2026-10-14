import { SCREEN_SCHEMA } from 'schema';
import catalogIt from '../../../public/examples/i18n/it.json';
import catalogEn from '../../../public/examples/i18n/en.json';
import { stubViewportHeight } from '../select-testing';
import { openShowcase, plainText, setupShowcase, teardownShowcase } from '../showcase-testing';
import { helpTypes, nodeTypesIn, propertiesOf, relatedDefinitions } from './showcase-tools';

const NODE_TYPES = (SCREEN_SCHEMA as unknown as { $defs: { node: { properties: { type: { enum: string[] } } } } }).$defs.node.properties.type.enum;

describe('Vetrina: JSON e aiuto delle sezioni', () => {
  it('i tipi della sezione: anche nei contenitori, nelle schede e nei passi; non i tipi dei campi', () => {
    const section = {
      type: 'section',
      components: [
        { type: 'box', components: [{ type: 'button', label: 'a' }, { type: 'text', text: 'b' }] },
        { type: 'tabs', tabs: [{ title: 'x', components: [{ type: 'table', source: 's', columns: [{ field: 'f', type: 'text' }] }] }] },
        { type: 'form', fields: [{ name: 'n', type: 'number' }] },
        { type: 'button', label: 'c' },
      ],
    };
    expect(nodeTypesIn(section)).toEqual(['section', 'box', 'button', 'text', 'tabs', 'table', 'form']);
    expect(helpTypes(section)).toEqual(['box', 'button', 'text', 'tabs', 'table', 'form']);
    expect(helpTypes({ type: 'section', components: [] })).toEqual(['section']);
  });

  it('data source e sequenze usati dalla sezione, comprese quelle richiamate dalle sequenze', () => {
    const screen = {
      dataSources: { elenco: { url: '/a' }, salva: { url: '/b' }, altro: { url: '/c' } },
      actions: { invia: [{ call: 'salva' }], inutile: [{ toast: 'x' }] },
    };
    const section = { type: 'section', components: [{ type: 'table', source: 'elenco' }, { type: 'button', onClick: { run: 'invia' } }] };
    expect(relatedDefinitions(section, screen)).toEqual({
      dataSources: { elenco: { url: '/a' }, salva: { url: '/b' } },
      actions: { invia: [{ call: 'salva' }] },
    });
    expect(relatedDefinitions({ type: 'section', components: [] }, screen)).toBeNull();
  });

  it('ogni tipo di componente ha titolo e spiegazione in italiano e in inglese; le proprietà vengono dallo schema', () => {
    for (const catalog of [catalogIt, catalogEn] as Record<string, string>[]) {
      for (const type of NODE_TYPES) {
        expect(catalog[`app.help.${type}.title`], type).toBeTruthy();
        expect(catalog[`app.help.${type}`], type).toBeTruthy();
      }
    }
    expect(propertiesOf('kanban').map((p) => p.name)).toContain('onMove');
    expect(propertiesOf('image').find((p) => p.name === 'alt')).toMatchObject({ required: true });
  });

  describe('nella demo', () => {
    let restoreViewport: () => void;
    beforeAll(() => (restoreViewport = stubViewportHeight()));
    afterAll(() => restoreViewport());
    beforeEach(() => setupShowcase());
    afterEach(() => teardownShowcase());

    it('«JSON» mostra la sezione colorata con i data source che usa; «Aiuto» spiega i suoi componenti', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/vetrina/vetrina-attivita');
      // L'immagine d'esempio non è il marchio della piattaforma.
      expect(el.querySelector('main lc-image img')?.getAttribute('src')).toBe('examples/immagini/attivita.svg');
      await until(() => !!el.querySelector('main lc-kanban'), 'kanban');
      const card = el.querySelector('main lc-kanban')!.closest('lc-section') as HTMLElement;
      const buttons = [...card.querySelectorAll<HTMLButtonElement>('.ant-card-extra button')];
      expect(buttons.map((b) => plainText(b.textContent))).toEqual(['JSON', 'Aiuto']);
      expect(buttons[0].getAttribute('aria-label')).toMatch(/^JSON della sezione «.+»$/);

      buttons[0].click();
      await until(() => document.querySelectorAll('.ant-modal lc-code-view pre').length === 2, 'sorgente');
      const [section, related] = [...document.querySelectorAll<HTMLElement>('.ant-modal lc-code-view pre')];
      expect(JSON.parse(section.textContent!)).toMatchObject({ type: 'section' });
      expect(section.querySelector('.lc-code-key')?.textContent).toBe('"id"');
      expect(section.querySelector('.lc-code-expression')).not.toBeNull();
      expect(Object.keys(JSON.parse(related.textContent!).dataSources)).toEqual(['attivita', 'spostaAttivita']);
      // Nessun HTML dai dati: solo elementi costruiti.
      expect(section.querySelector('script, img, a')).toBeNull();
      (document.querySelector('.ant-modal-close') as HTMLElement).click();

      buttons[1].click();
      await until(() => !!document.querySelector('#help-kanban'), 'aiuto');
      expect(plainText(document.querySelector('#help-kanban')?.textContent)).toBe('Kanban kanban');
      const help = document.querySelector('#help-kanban')!.closest('section')!;
      expect(plainText(help.querySelector('lc-markdown')?.textContent)).toContain('Schede in colonne');
      expect([...help.querySelectorAll('dt code')].map((c) => c.textContent)).toContain('onMove');
    });
  });
});
