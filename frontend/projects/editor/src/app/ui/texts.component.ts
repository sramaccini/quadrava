import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { getIn, isObject, type Path } from '../model/doc-ops';
import { EDITOR_LOCALES, EditorStore } from '../model/editor-store';
import { ownerOf, targetAt } from '../model/schema-info';
import { fallbackText } from '../model/templates';
import { collectTexts, translatable, usedKeys, type TextEntry } from '../model/texts';

interface TextRow {
  entry: TextEntry;
  /** Dove sta il testo: tipo dell'elemento e proprietà. */
  where: string;
  owner: Path;
  /** Testo per lingua (per le chiavi), e quali lingue mancano. */
  values: Record<string, string>;
  missing: string[];
  convertible: boolean;
}

/**
 * Testi della schermata e traduzioni. I testi semplici si rendono traducibili con un clic (chiave generata dal testo);
 * per ogni chiave si scrivono le traduzioni nelle lingue dell'editor, che valgono subito nell'anteprima e si esportano
 * in un file da unire ai cataloghi (`examples/i18n/<lingua>.json`).
 */
@Component({
  selector: 'ed-texts',
  imports: [NzButtonModule, NzIconModule, NzInputModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './texts.component.scss',
  templateUrl: './texts.component.html',
})
export class TextsComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly locales = EDITOR_LOCALES;

  protected readonly rows = computed<TextRow[]>(() => {
    const doc = this.store.doc();
    this.store.translations();
    this.i18n.locale();
    return collectTexts(doc).map((entry) => {
      const owner = ownerOf(doc, entry.path);
      const target = targetAt(doc, owner);
      const kind = target?.kind === 'node' ? this.i18n.t('ed.type.' + target.type) : target ? this.i18n.t('ed.' + target.kind) : '';
      const values: Record<string, string> = {};
      if (entry.key) for (const locale of this.locales) values[locale] = this.store.translation(locale, entry.key) ?? '';
      const missing = this.store.missingLocales(entry);
      return {
        entry,
        where: `${kind} · ${this.describePath(entry.path, owner)}`,
        owner,
        values,
        missing,
        convertible: entry.kind === 'plain' && translatable('x', entry.value) !== null,
      };
    });
  });

  private describePath(path: Path, owner: Path): string {
    // La proprietà, preceduta dall'elemento dell'elenco se il testo sta in una colonna, un campo, un passo…
    const rest = path.slice(owner.length);
    const parent = rest.length > 1 ? getIn(this.store.doc(), [...owner, ...rest.slice(0, -1)]) : null;
    const item = isObject(parent) ? (parent['field'] ?? parent['name'] ?? parent['id']) : null;
    const list = rest.length > 2 ? String(rest[0]) + ' › ' : '';
    return list + (typeof item === 'string' ? `${item} › ` : '') + String(path.at(-1));
  }

  protected preview(entry: TextEntry): string {
    return entry.kind === 'plain' ? entry.value : fallbackText(entry.value);
  }

  protected select(row: TextRow): void {
    this.store.select(row.owner);
  }

  protected convert(row: TextRow): void {
    this.store.makeTranslatable(row.entry.path);
  }

  protected setTranslation(row: TextRow, locale: string, text: string): void {
    if (row.entry.key) this.store.setTranslation(locale, row.entry.key, text);
  }

  /** Scarica le traduzioni delle chiavi usate dalla schermata, per lingua, da unire ai cataloghi. */
  protected exportTranslations(): void {
    const keys = [...usedKeys(collectTexts(this.store.doc()))].sort();
    const out: Record<string, Record<string, string>> = {};
    for (const locale of this.locales) {
      out[locale] = {};
      for (const key of keys) {
        const text = this.store.translation(locale, key);
        if (text) out[locale][key] = text;
      }
    }
    const doc = this.store.doc();
    const name = isObject(doc) && typeof doc['screen'] === 'string' && doc['screen'] ? doc['screen'] : 'schermata';
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.i18n.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
