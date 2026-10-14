import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Confirmation, I18n, Notifier } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { getIn, isObject, type Path } from '../model/doc-ops';
import { EditorStore, LANGUAGE_CODE } from '../model/editor-store';
import { ownerOf, targetAt } from '../model/schema-info';
import { fallbackText } from '../model/templates';
import { collectTexts, translatable, usedKeys, type TextEntry } from '../model/texts';
import { RegistryClient, RegistryError, readRegistrySettings } from '../model/registry-client';

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
  /** Lingue delle traduzioni (una colonna ciascuna). */
  protected readonly locales = computed(() => this.store.languages());
  protected readonly defaultLocale = computed(() => this.i18n.defaultLocale());
  /** Perché la lingua scritta non si può aggiungere. */
  protected readonly languageError = signal('');
  private readonly confirmation = inject(Confirmation);
  private readonly client = inject(RegistryClient);
  private readonly notifier = inject(Notifier);
  /** Applicazione e ambiente scelti nel pannello del registro. */
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

  /**
   * Salva nel registro le traduzioni scritte nell'editor e le pubblica nell'ambiente scelto: per ogni lingua si parte
   * dall'ultima versione del catalogo (documento `messages`), si aggiungono o sostituiscono le chiavi modificate e si
   * salva una versione nuova, indicando quella di partenza (se qualcuno ha salvato nel frattempo il registro rifiuta e
   * si riprova). Le altre chiavi del catalogo restano com'erano.
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

  /** Aggiunge la lingua scritta (codice come `fr` o `pt-BR`): una colonna nuova da compilare. */
  protected addLanguage(input: HTMLInputElement): void {
    const code = input.value.trim();
    if (!code) return;
    if (!LANGUAGE_CODE.test(code)) return this.languageError.set(this.i18n.t('ed.texts.languageInvalid'));
    if (this.locales().includes(code)) return this.languageError.set(this.i18n.t('ed.texts.languageExists', { locale: code }));
    this.store.addLanguage(code);
    input.value = '';
    this.notifier.toast(this.i18n.t('ed.texts.languageAdded', { locale: code }));
  }

  /** Toglie una lingua; se ha traduzioni scritte nell'editor chiede conferma (si perdono). */
  protected async removeLanguage(locale: string): Promise<void> {
    const written = Object.keys(this.store.translations()[locale] ?? {}).length;
    if (written && !(await this.confirmation.confirm(this.i18n.t('ed.texts.removeLanguageConfirm', { locale, n: written })))) return;
    this.store.removeLanguage(locale);
  }

  /**
   * Importa un file di traduzioni: quello di «Esporta traduzioni» (`{ "<lingua>": { … } }`) oppure il catalogo di una
   * lingua (`{ "<chiave>": "testo" }`) con la lingua nel nome del file (`fr.json`, `demo.fr.json`).
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

  /** Scarica le traduzioni delle chiavi usate dalla schermata, per lingua, da unire ai cataloghi. */
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
    const name = isObject(doc) && typeof doc['screen'] === 'string' && doc['screen'] ? doc['screen'] : 'schermata';
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.i18n.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
