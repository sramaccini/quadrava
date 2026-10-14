import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { CodeViewComponent, IconComponent, MarkdownComponent, SectionTools, type SectionContext } from 'components';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NZ_MODAL_DATA, NzModalService } from 'ng-zorro-antd/modal';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { SCREEN_SCHEMA } from 'schema';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Le sezioni delle vetrine (schermate `vetrina-*`) hanno nell'intestazione «JSON», con la definizione dell'esempio e
 * i data source e le sequenze che usa, e «Aiuto», con la spiegazione dei componenti che contiene.
 */
@Injectable({ providedIn: 'root' })
export class ShowcaseTools extends SectionTools {
  private readonly modal = inject(NzModalService);
  private readonly i18n = inject(I18n);

  applies({ runtime }: SectionContext): boolean {
    return runtime.definition.screen.startsWith('vetrina-');
  }

  showSource({ node, runtime, title }: SectionContext): void {
    this.modal.create({
      nzTitle: this.i18n.t('app.showcase.sourceTitle', { title: title ?? '' }),
      nzContent: SourceDialog,
      nzData: { section: node, related: relatedDefinitions(node, runtime.definition as unknown as Json) } satisfies SourceData,
      nzFooter: null,
      nzWidth: 820,
    });
  }

  showHelp({ node, title }: SectionContext): void {
    this.modal.create({
      nzTitle: this.i18n.t('app.showcase.helpTitle', { title: title ?? '' }),
      nzContent: HelpDialog,
      nzData: { types: helpTypes(node) } satisfies HelpData,
      nzFooter: null,
      nzWidth: 760,
    });
  }
}

/** I tipi da spiegare: quelli dentro la sezione (la sezione stessa solo se non contiene altro). */
export function helpTypes(section: unknown): string[] {
  const types = nodeTypesIn(section);
  return types.length > 1 ? types.filter((t) => t !== 'section') : types;
}

/** I tipi di componente nella sezione (lei compresa), nell'ordine in cui compaiono, senza ripetizioni. */
export function nodeTypesIn(section: unknown): string[] {
  const types: string[] = [];
  const visit = (value: unknown, isNode: boolean): void => {
    if (Array.isArray(value)) return value.forEach((v) => visit(v, isNode));
    if (!isObject(value)) return;
    if (isNode && typeof value['type'] === 'string' && !types.includes(value['type'])) types.push(value['type']);
    // Sono componenti gli elementi di un elenco `components` (nella sezione, nei contenitori, nelle schede, nei passi).
    for (const [key, child] of Object.entries(value)) visit(child, key === 'components');
  };
  visit(section, true);
  return types;
}

/**
 * Data source e sequenze con nome (`actions`) della schermata che la sezione usa: quelli il cui nome compare come
 * valore nella sezione (`dataSource`, `call`, `refresh`, `run`…), e a loro volta quelli usati dalle sequenze.
 */
export function relatedDefinitions(section: unknown, screen: Json): Json | null {
  const dataSources = isObject(screen['dataSources']) ? screen['dataSources'] : {};
  const actions = isObject(screen['actions']) ? screen['actions'] : {};
  const used = { dataSources: {} as Json, actions: {} as Json };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (isObject(value)) return Object.values(value).forEach(visit);
    if (typeof value !== 'string') return;
    if (value in dataSources && !(value in used.dataSources)) used.dataSources[value] = dataSources[value];
    if (value in actions && !(value in used.actions)) {
      used.actions[value] = actions[value];
      visit(actions[value]);
    }
  };
  visit(section);
  const related: Json = {};
  if (Object.keys(used.dataSources).length) related['dataSources'] = used.dataSources;
  if (Object.keys(used.actions).length) related['actions'] = used.actions;
  return Object.keys(related).length ? related : null;
}

interface SourceData {
  section: unknown;
  related: Json | null;
}

@Component({
  selector: 'app-showcase-source',
  imports: [CodeViewComponent, NzButtonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
    .bar h3 { margin: 0; font-size: 14px; font-weight: 600; }
    .bar + lc-code-view { margin-bottom: 16px; }
    .copied { color: var(--lc-color-success); font-size: 13px; margin-right: 8px; }
    lc-icon { margin-right: 4px; }
  `,
  template: `
    @for (block of blocks; track block.key) {
      <div class="bar">
        <h3>{{ i18n.t(block.key) }}</h3>
        <span>
          <span class="copied" aria-live="polite">{{ copied() === block.key ? i18n.t('lc.code.copied') : '' }}</span>
          <button nz-button nzSize="small" type="button" (click)="copy(block)"><lc-icon name="copy" />{{ i18n.t('lc.code.copy') }}</button>
        </span>
      </div>
      <lc-code-view [code]="block.code" [label]="i18n.t(block.key)" />
    }
  `,
})
export class SourceDialog {
  protected readonly i18n = inject(I18n);
  private readonly data = inject<SourceData>(NZ_MODAL_DATA);
  protected readonly copied = signal<string | null>(null);
  protected readonly blocks = [
    { key: 'app.showcase.section', code: JSON.stringify(this.data.section, null, 2) },
    ...(this.data.related ? [{ key: 'app.showcase.related', code: JSON.stringify(this.data.related, null, 2) }] : []),
  ];

  protected async copy(block: { key: string; code: string }): Promise<void> {
    try {
      await navigator.clipboard.writeText(block.code);
      this.copied.set(block.key);
    } catch {
      // Appunti non disponibili (permesso negato, pagina non sicura): il testo resta selezionabile a mano.
      this.copied.set(null);
    }
  }
}

interface HelpData {
  types: string[];
}

interface PropertyHelp {
  name: string;
  required: boolean;
  description: string | null;
}

const NODE_SCHEMA = (SCREEN_SCHEMA as unknown as { $defs: Record<string, Json> }).$defs['node'];

/** Le proprietà proprie di un tipo di componente secondo lo schema delle schermate, con la loro descrizione. */
export function propertiesOf(type: string): PropertyHelp[] {
  for (const branch of (NODE_SCHEMA['allOf'] as Json[]) ?? []) {
    const condition = (branch['if'] as { properties?: { type?: { const?: string } } }).properties?.type?.const;
    if (condition !== type) continue;
    const then = branch['then'] as { properties?: Record<string, Json>; required?: string[] };
    return Object.entries(then.properties ?? {}).map(([name, schema]) => ({
      name,
      required: (then.required ?? []).includes(name),
      description: typeof schema['description'] === 'string' ? schema['description'] : null,
    }));
  }
  return [];
}

@Component({
  selector: 'app-showcase-help',
  imports: [MarkdownComponent, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section + section { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--lc-color-border); }
    h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
    h3 code, dt code { font-size: 13px; }
    h4 { margin: 12px 0 4px; font-size: 13px; font-weight: 600; color: var(--lc-color-muted); }
    dl { margin: 0; display: grid; grid-template-columns: minmax(120px, max-content) 1fr; gap: 4px 12px; font-size: 13px; }
    dt { white-space: nowrap; }
    dd { margin: 0; color: var(--lc-color-muted); }
    .common { margin-top: 20px; font-size: 13px; color: var(--lc-color-muted); }
  `,
  template: `
    @for (item of items; track item.type) {
      <section [attr.aria-labelledby]="'help-' + item.type">
        <h3 [id]="'help-' + item.type">{{ i18n.t('app.help.' + item.type + '.title') }} <code>{{ item.type }}</code></h3>
        <lc-markdown [source]="i18n.t('app.help.' + item.type)" />
        @if (item.properties.length) {
          <h4>{{ i18n.t('app.showcase.properties') }}</h4>
          <dl>
            @for (p of item.properties; track p.name) {
              <dt>
                <code>{{ p.name }}</code>
                @if (p.required) {
                  <nz-tag>{{ i18n.t('app.showcase.required') }}</nz-tag>
                }
              </dt>
              <dd>{{ p.description ?? '' }}</dd>
            }
          </dl>
        }
      </section>
    }
    <p class="common">{{ i18n.t('app.showcase.common') }}</p>
  `,
})
export class HelpDialog {
  protected readonly i18n = inject(I18n);
  private readonly data = inject<HelpData>(NZ_MODAL_DATA);
  protected readonly items = this.data.types.map((type) => ({ type, properties: propertiesOf(type) }));
}
