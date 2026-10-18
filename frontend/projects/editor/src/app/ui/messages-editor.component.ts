import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { isObject, setIn, type JsonObject } from '../model/doc-ops';
import { MessagesStore } from '../model/messages-store';
import { KnownTranslations } from '../model/shared-state';
import { JsonViewComponent } from './json-view.component';

/** Key of a text: letters, digits, dots, hyphens and underscores (as in the catalogues of the registry). */
const KEY = /^[A-Za-z0-9_.-]{1,200}$/;

interface Row {
  key: string;
  text: string;
  /** Text of the default language, as a reference (empty in the default language itself). */
  reference: string;
  missing: boolean;
}

/**
 * The window of a translation catalogue of the project (`i18n/<language>.json`): a table with the keys, the text in this
 * language and, as a reference, the one in the default language; keys missing here are flagged. A search filters by key
 * or text; keys are added and removed; the JSON is in the second tab. The texts written in the «Texts» panel of a screen
 * arrive here when the screen is saved.
 */
@Component({
  selector: 'ed-messages-editor',
  imports: [FormsModule, JsonViewComponent, NzButtonModule, NzIconModule, NzInputModule, NzTabsModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 8px; background: var(--lc-color-background); }
    nz-tabs { padding: 0; }
    .view { flex: 1; min-height: 0; }
    .texts { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 12px; gap: 8px; }
    .tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .tools input { width: 220px; }
    .table { flex: 1; min-height: 0; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 4px 6px; border-bottom: 1px solid var(--lc-color-border); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: var(--lc-color-surface); z-index: 1; }
    td.key { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; white-space: nowrap; }
    td.reference { color: var(--lc-color-muted); }
    tr.missing td.key { color: var(--lc-color-danger); }
    .error { margin: 0; font-size: 12px; color: var(--lc-color-danger); }
    .count { margin-left: auto; font-size: 12px; color: var(--lc-color-muted); }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <div class="ed-tabs-box">
      <nz-tabs nzType="card" nzTabPosition="bottom" nzSize="small" [nzSelectedIndex]="view() === 'json' ? 1 : 0" (nzSelectedIndexChange)="view.set($event === 1 ? 'json' : 'texts')" [nzAnimated]="false">
        <nz-tab [nzTitle]="i18n.t('ed.tabs.texts')"></nz-tab>
        <nz-tab [nzTitle]="i18n.t('ed.tabs.json')"></nz-tab>
      </nz-tabs>
      <div class="view">
        @if (view() === 'json') {
          <ed-json-view />
        } @else {
          <section class="texts" [attr.aria-label]="i18n.t('ed.tabs.texts')">
            <div class="tools">
              <input nz-input nzSize="small" type="search" [attr.aria-label]="i18n.t('ed.messages.search')" [placeholder]="i18n.t('ed.messages.search')" [ngModel]="query()" (ngModelChange)="query.set($event)" />
              <form class="tools" ngNoForm (submit)="$event.preventDefault(); add()">
                <input nz-input nzSize="small" id="messages-new-key" spellcheck="false" [attr.aria-label]="i18n.t('ed.messages.newKey')" [placeholder]="i18n.t('ed.messages.newKey')" [ngModel]="newKey()" (ngModelChange)="newKey.set($event.trim())" />
                <button nz-button nzSize="small" type="submit" [disabled]="!canAdd()"><span nz-icon nzType="plus"></span>{{ i18n.t('ed.messages.add') }}</button>
              </form>
              <span class="count">{{ i18n.t('ed.messages.count', { n: rows().length, missing: missingCount() }) }}</span>
            </div>
            @if (newKey() && !canAdd()) {
              <p class="error" role="alert">{{ i18n.t('ed.messages.keyInvalid') }}</p>
            }
            <div class="table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{{ i18n.t('ed.messages.key') }}</th>
                    <th scope="col">{{ language() }}</th>
                    @if (!isDefault()) {
                      <th scope="col">{{ defaultLanguage() }}</th>
                    }
                    <th scope="col"><span class="visually-hidden">{{ i18n.t('ed.messages.actions') }}</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of visible(); track row.key) {
                    <tr [class.missing]="row.missing">
                      <td class="key">{{ row.key }}</td>
                      <td><textarea nz-input rows="1" [attr.aria-label]="i18n.t('ed.messages.textOf', { key: row.key })" [attr.data-text]="row.key" [ngModel]="row.text" (ngModelChange)="set(row.key, $event)"></textarea></td>
                      @if (!isDefault()) {
                        <td class="reference">{{ row.reference }}</td>
                      }
                      <td>
                        <button nz-button nzType="text" nzDanger nzSize="small" type="button" [attr.data-remove]="row.key" (click)="remove(row.key)" [attr.aria-label]="i18n.t('ed.messages.remove', { key: row.key })" [nz-tooltip]="i18n.t('ed.messages.remove', { key: row.key })">
                          <span nz-icon nzType="delete"></span>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      </div>
    </div>
  `,
})
export class MessagesEditorComponent {
  protected readonly store = inject(MessagesStore);
  protected readonly i18n = inject(I18n);
  private readonly known = inject(KnownTranslations);
  protected readonly view = signal<'texts' | 'json'>('texts');
  protected readonly query = signal('');
  protected readonly newKey = signal('');
  protected readonly language = this.store.language;
  protected readonly defaultLanguage = computed(() => this.known.project()?.defaultLanguage ?? '');
  protected readonly isDefault = computed(() => !this.defaultLanguage() || this.defaultLanguage() === this.language());

  /** Keys of this catalogue and of the default language, with their texts. */
  protected readonly rows = computed<Row[]>(() => {
    const doc = this.store.doc();
    const own = isObject(doc) ? doc : {};
    const reference = this.isDefault() ? {} : (this.known.project()?.catalogues[this.defaultLanguage()] ?? {});
    const keys = [...new Set([...Object.keys(own), ...Object.keys(reference)])].sort();
    return keys.map((key) => {
      const text = typeof own[key] === 'string' ? (own[key] as string) : '';
      return { key, text, reference: reference[key] ?? '', missing: text === '' };
    });
  });
  protected readonly missingCount = computed(() => this.rows().filter((r) => r.missing).length);
  protected readonly visible = computed(() => {
    const query = this.query().trim().toLowerCase();
    return query ? this.rows().filter((r) => [r.key, r.text, r.reference].some((v) => v.toLowerCase().includes(query))) : this.rows();
  });
  protected readonly canAdd = computed(() => KEY.test(this.newKey()) && !this.rows().some((r) => r.key === this.newKey()));

  protected set(key: string, text: string): void {
    this.store.setValue([key], text);
  }

  protected add(): void {
    if (!this.canAdd()) return;
    this.store.apply(setIn(this.store.doc(), [this.newKey()], ''));
    this.query.set(this.newKey());
    this.newKey.set('');
  }

  protected remove(key: string): void {
    const doc = this.store.doc();
    if (!isObject(doc)) return;
    const { [key]: _removed, ...rest } = doc as JsonObject;
    this.store.apply(rest);
  }
}
