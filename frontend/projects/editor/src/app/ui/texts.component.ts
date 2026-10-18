import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Confirmation, I18n, Notifier } from 'core';
import { FormsModule } from '@angular/forms';
import { NzAutocompleteModule } from 'ng-zorro-antd/auto-complete';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { getIn, isObject, type Path } from '../model/doc-ops';
import { EditorStore, LANGUAGE_CODE } from '../model/editor-store';
import { SUGGESTED_LANGUAGES, languageFromInput, languageName } from '../model/languages';
import { KnownTranslations } from '../model/shared-state';
import { ownerOf, targetAt } from '../model/schema-info';
import { fallbackText } from '../model/templates';
import { collectTexts, translatable, usedKeys, type TextEntry } from '../model/texts';
import { RegistryClient, RegistryError, readRegistrySettings } from '../model/registry-client';

interface TextRow {
  entry: TextEntry;
  /** Where the text is: type of the element and property. */
  where: string;
  owner: Path;
  /** Text per language (for keys), and which languages are missing. */
  values: Record<string, string>;
  missing: string[];
  convertible: boolean;
}

/**
 * Texts of the screen and translations. Plain texts are made translatable with a click (key generated from the text);
 * for every key the translations are written in the editor's languages, which apply at once in the preview and are exported
 * to a file to merge into the catalogues (`examples/i18n/<language>.json`).
 */
@Component({
  selector: 'ed-texts',
  imports: [FormsModule, NzAutocompleteModule, NzButtonModule, NzIconModule, NzInputModule, NzTagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './texts.component.scss',
  templateUrl: './texts.component.html',
})
export class TextsComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  /** Languages of the translations (one column each). */
  protected readonly locales = computed(() => this.store.languages());
  protected readonly defaultLocale = computed(() => this.store.defaultLanguage());
  /** With a project the languages are those of the project (managed in its settings) and the texts go into its catalogues. */
  protected readonly inProject = computed(() => this.projectTexts() !== null);
  private readonly projectTexts = inject(KnownTranslations).project;
  /** Languages offered (those not yet present), with the name in the editor's language. */
  protected readonly suggestions = computed(() => {
    const ui = this.i18n.locale();
    const present = new Set(this.locales());
    return SUGGESTED_LANGUAGES.filter((code) => !present.has(code)).map((code) => ({ code, label: `${languageName(code, ui)} (${code})` }));
  });

  /** Text typed in the «Add language» box. */
  protected readonly languageText = signal('');
  /** Suggestions containing the typed text (name or code). */
  protected readonly filteredLanguages = computed(() => {
    const query = this.languageText().trim().toLowerCase();
    return query ? this.suggestions().filter((s) => s.label.toLowerCase().includes(query)) : this.suggestions();
  });

  protected nameOf(locale: string): string {
    return languageName(locale, this.i18n.locale());
  }

  protected setDefault(locale: string): void {
    if (this.store.setDefaultLanguage(locale)) this.notifier.toast(this.i18n.t('ed.texts.defaultChanged', { name: this.nameOf(locale) }));
  }
  /** Why the typed language cannot be added. */
  protected readonly languageError = signal('');
  private readonly confirmation = inject(Confirmation);
  private readonly client = inject(RegistryClient);
  private readonly notifier = inject(Notifier);
  /** Application and environment chosen in the registry panel. */
  protected registry = readRegistrySettings();
  protected readonly saving = signal(false);

  protected readonly rows = computed<TextRow[]>(() => {
    const doc = this.store.doc();
    this.store.translations();
    this.i18n.locale();
    return collectTexts(doc).map((entry) => {
      const owner = ownerOf(doc, entry.path);
      const target = targetAt(doc, owner);
      const kind = target?.kind === 'node' ? this.i18n.t('ed.type.' + target.type) : target ? this.i18n.t('ed.' + target.kind) : '';
      const values: Record<string, string> = {};
      if (entry.key) for (const locale of this.locales()) values[locale] = this.store.translation(locale, entry.key) ?? '';
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
    // The property, preceded by the element of the list if the text is in a column, a field, a step…
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

  /**
   * Saves in the registry the translations written in the editor and publishes them in the chosen environment: for every language it starts
   * from the last version of the catalogue (`messages` document), adds or replaces the changed keys and
   * saves a new version, giving the starting one (if someone saved in the meantime the registry refuses and
   * it tries again). The other keys of the catalogue stay as they were.
   */
  protected async saveToRegistry(): Promise<void> {
    this.registry = readRegistrySettings();
    const { appId, env } = this.registry;
    const changed = Object.entries(this.store.translations()).filter(([locale, texts]) => this.locales().includes(locale) && Object.keys(texts).length > 0);
    if (!appId || changed.length === 0) {
      this.notifier.toast(this.i18n.t(appId ? 'ed.texts.nothingToSave' : 'ed.texts.registryHint'));
      return;
    }
    this.saving.set(true);
    const done: string[] = [];
    try {
      for (const [locale, texts] of changed) {
        const latest = (await this.client.versions(appId, 'messages', locale))[0];
        const current = latest ? ((await this.client.version(appId, 'messages', locale, latest.hash)) as { texts?: Record<string, string> }) : null;
        const merged = { ...(current?.texts ?? {}), ...texts };
        const saved = await this.client.save(appId, 'messages', locale, { schemaVersion: '1.0', messages: locale, texts: merged }, latest?.hash);
        await this.client.publish(appId, 'messages', locale, env, saved.hash);
        done.push(locale);
      }
      this.notifier.toast(this.i18n.t('ed.texts.savedRegistry', { locales: done.join(', '), env }));
    } catch (e) {
      const reason = e instanceof RegistryError ? e.message : '';
      const status = e instanceof RegistryError ? e.status : 0;
      this.notifier.toast(
        status === 0 ? this.i18n.t('ed.registry.unreachable') : status === 412 ? this.i18n.t('ed.texts.conflict') : this.i18n.t('ed.registry.rejected', { reason }),
        'error',
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Adds the typed language (code such as `fr` or `pt-BR`): a new column to fill in. */
  protected addLanguage(input: HTMLInputElement): void {
    if (!input.value.trim()) return;
    // The code, the name of an offered language or the item chosen among the suggestions («French (fr)»).
    const code = languageFromInput(input.value, this.i18n.locale());
    if (!code || !LANGUAGE_CODE.test(code)) return this.languageError.set(this.i18n.t('ed.texts.languageInvalid'));
    if (this.locales().includes(code)) return this.languageError.set(this.i18n.t('ed.texts.languageExists', { locale: this.nameOf(code) }));
    this.store.addLanguage(code);
    input.value = '';
    this.languageText.set('');
    this.notifier.toast(this.i18n.t('ed.texts.languageAdded', { locale: this.nameOf(code) }));
  }

  /** Removes a language; if it has translations written in the editor it asks for confirmation (they are lost). */
  protected async removeLanguage(locale: string): Promise<void> {
    const written = Object.keys(this.store.translations()[locale] ?? {}).length;
    if (written && !(await this.confirmation.confirm(this.i18n.t('ed.texts.removeLanguageConfirm', { locale, n: written })))) return;
    this.store.removeLanguage(locale);
  }

  /**
   * Imports a file of translations: the one of «Export translations» (`{ "<language>": { … } }`) or the catalogue of one
   * language (`{ "<key>": "text" }`) with the language in the file name (`fr.json`, `demo.fr.json`).
   */
  protected async importTranslations(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as unknown;
      const stem = file.name.replace(/\.json$/i, '').split('.').at(-1) ?? '';
      const flat = isObject(data as never) && Object.values(data as Record<string, unknown>).every((v) => typeof v === 'string');
      const count = this.store.importTranslations(flat && LANGUAGE_CODE.test(stem) ? { [stem]: data } : data);
      if (count === null) throw new Error(this.i18n.t('ed.texts.importFormat'));
      this.notifier.toast(this.i18n.t('ed.texts.imported', { n: count, name: file.name }));
    } catch (e) {
      this.notifier.toast(this.i18n.t('ed.loadFailed', { e: e instanceof Error ? e.message : String(e) }), 'error');
    }
  }

  /** Downloads the translations of the keys used by the screen, by language, to merge into the catalogues. */
  protected exportTranslations(): void {
    const keys = [...usedKeys(collectTexts(this.store.doc()))].sort();
    const out: Record<string, Record<string, string>> = {};
    for (const locale of this.locales()) {
      out[locale] = {};
      for (const key of keys) {
        const text = this.store.translation(locale, key);
        if (text) out[locale][key] = text;
      }
    }
    const doc = this.store.doc();
    const name = isObject(doc) && typeof doc['screen'] === 'string' && doc['screen'] ? doc['screen'] : 'screen';
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.i18n.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
