import { SCREEN_SCHEMA } from 'schema';
import catalogIt from '../../../public/examples/i18n/it.json';
import catalogEn from '../../../public/examples/i18n/en.json';
import { stubViewportHeight } from '../select-testing';
import { openShowcase, plainText, setupShowcase, teardownShowcase } from '../showcase-testing';
import { helpTypes, nodeTypesIn, propertiesOf, relatedDefinitions } from './showcase-tools';

const NODE_TYPES = (SCREEN_SCHEMA as unknown as { $defs: { node: { properties: { type: { enum: string[] } } } } }).$defs.node.properties.type.enum;

describe('Showcase: JSON and help of the sections', () => {
  it('the types of the section: also in containers, tabs and steps; not the field types', () => {
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

  it('data sources and sequences used by the section, including those called by the sequences', () => {
    const screen = {
      dataSources: { list: { url: '/a' }, save: { url: '/b' }, other: { url: '/c' } },
      actions: { send: [{ call: 'save' }], unused: [{ toast: 'x' }] },
    };
    const section = { type: 'section', components: [{ type: 'table', source: 'list' }, { type: 'button', onClick: { run: 'send' } }] };
    expect(relatedDefinitions(section, screen)).toEqual({
      dataSources: { list: { url: '/a' }, save: { url: '/b' } },
      actions: { send: [{ call: 'save' }] },
    });
    expect(relatedDefinitions({ type: 'section', components: [] }, screen)).toBeNull();
  });

  it('every component type has a title and an explanation in Italian and in English; the properties come from the schema', () => {
    for (const catalog of [catalogIt, catalogEn] as Record<string, string>[]) {
      for (const type of NODE_TYPES) {
        expect(catalog[`app.help.${type}.title`], type).toBeTruthy();
        expect(catalog[`app.help.${type}`], type).toBeTruthy();
      }
    }
    expect(propertiesOf('kanban').map((p) => p.name)).toContain('onMove');
    expect(propertiesOf('image').find((p) => p.name === 'alt')).toMatchObject({ required: true });
  });

  describe('in the demo', () => {
    let restoreViewport: () => void;
    beforeAll(() => (restoreViewport = stubViewportHeight()));
    afterAll(() => restoreViewport());
    beforeEach(() => setupShowcase());
    afterEach(() => teardownShowcase());

    it('«JSON» shows the section coloured with the data sources it uses; «Help» explains its components', { timeout: 20000 }, async () => {
      const { el, until } = await openShowcase('/showcase/showcase-tasks');
      // The sample image is not the platform's brand.
      expect(el.querySelector('main lc-image img')?.getAttribute('src')).toBe('examples/images/tasks.svg');
      await until(() => !!el.querySelector('main lc-kanban'), 'kanban');
      const card = el.querySelector('main lc-kanban')!.closest('lc-section') as HTMLElement;
      const buttons = [...card.querySelectorAll<HTMLButtonElement>('.ant-card-extra button')];
      expect(buttons.map((b) => plainText(b.textContent))).toEqual(['JSON', 'Help']);
      expect(buttons[0].getAttribute('aria-label')).toMatch(/^JSON of the «.+» section$/);

      buttons[0].click();
      await until(() => document.querySelectorAll('.ant-modal lc-code-view pre').length === 2, 'source');
      const [section, related] = [...document.querySelectorAll<HTMLElement>('.ant-modal lc-code-view pre')];
      expect(JSON.parse(section.textContent!)).toMatchObject({ type: 'section' });
      expect(section.querySelector('.lc-code-key')?.textContent).toBe('"id"');
      expect(section.querySelector('.lc-code-expression')).not.toBeNull();
      expect(Object.keys(JSON.parse(related.textContent!).dataSources)).toEqual(['tasks', 'moveTask', 'statuses']);
      // No HTML from the data: only built elements.
      expect(section.querySelector('script, img, a')).toBeNull();
      (document.querySelector('.ant-modal-close') as HTMLElement).click();

      buttons[1].click();
      await until(() => !!document.querySelector('#help-kanban'), 'help');
      expect(plainText(document.querySelector('#help-kanban')?.textContent)).toBe('Kanban kanban');
      const help = document.querySelector('#help-kanban')!.closest('section')!;
      expect(plainText(help.querySelector('lc-markdown')?.textContent)).toContain('Cards in columns');
      expect([...help.querySelectorAll('dt code')].map((c) => c.textContent)).toContain('onMove');
    });
  });
});
