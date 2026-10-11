import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { getIn, isObject, toPointer, type Json, type JsonObject } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { JsonFieldComponent } from './json-field.component';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

interface SourceView {
  name: string;
  value: JsonObject;
  hasBody: boolean;
  issues: string[];
}

/**
 * Data source della schermata: metodo, URL, parametri, corpo, paginazione. Accanto a ognuno, i dati di esempio che
 * l'anteprima restituisce al posto del servizio (restano nella bozza dell'editor, non nella schermata).
 */
@Component({
  selector: 'ed-data-sources',
  imports: [FormsModule, JsonFieldComponent, NzButtonModule, NzIconModule, NzInputModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './data-sources.component.scss',
  templateUrl: './data-sources.component.html',
})
export class DataSourcesComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly methods = METHODS;
  /** Nome che non si è potuto applicare (non valido o già usato). */
  protected readonly renameError = signal<string | null>(null);

  protected readonly sources = computed<SourceView[]>(() => {
    const doc = this.store.doc();
    const all = getIn(doc, ['dataSources']);
    if (!isObject(all)) return [];
    const issues = this.store.issues();
    return Object.entries(all).map(([name, value]) => {
      const pointer = toPointer(['dataSources', name]);
      const source = isObject(value) ? value : {};
      return {
        name,
        value: source,
        hasBody: ['POST', 'PUT', 'PATCH'].includes(String(source['method'])),
        issues: issues.filter((i) => i.pointer === pointer || i.pointer.startsWith(pointer + '/')).map((i) => `${i.pointer.slice(pointer.length) || '/'} ${i.message}`),
      };
    });
  });

  protected add(): void {
    this.store.addSource();
  }

  protected rename(from: string, input: HTMLInputElement): void {
    const to = input.value.trim();
    if (this.store.renameSource(from, to)) {
      this.renameError.set(null);
      return;
    }
    this.renameError.set(from);
    input.value = from;
  }

  protected set(name: string, key: string, value: Json | undefined): void {
    this.store.setValue(['dataSources', name, key], value === '' ? undefined : value);
  }

  protected text(value: Json | undefined): string {
    return typeof value === 'string' ? value : '';
  }
}
