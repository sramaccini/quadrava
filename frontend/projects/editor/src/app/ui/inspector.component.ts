import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from 'core';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { fromPointer, getIn, isObject, samePath, toPointer, type Json, type Path } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { definitionProperties, nodeProperties, screenProperties, type PropertyInfo } from '../model/schema-info';
import { JsonFieldComponent } from './json-field.component';

/** Proprietà mostrate come area di testo su più righe anche se sono semplici testi. */
const LONG_TEXT = new Set(['text', 'description', 'tooltip', 'title']);

/** Proprietà raccolte nel gruppo «Condizioni e aiuto», chiuso se nessuna è impostata. */
const CONDITIONS = new Set(['visibleIf', 'hiddenIf', 'enabledIf', 'readOnlyIf', 'nextIf', 'tooltip']);

interface Row {
  info: PropertyInfo;
  value: Json | undefined;
  path: Path;
  id: string;
  issues: string[];
}

/**
 * Pannello delle proprietà dell'elemento selezionato. I campi vengono dallo schema: testo, espressione, scelta,
 * sì/no, numero; il resto (elenchi di colonne, campi, passi) si modifica come JSON. Gli errori di ogni proprietà
 * compaiono sotto il campo.
 */
@Component({
  selector: 'ed-inspector',
  imports: [FormsModule, NgTemplateOutlet, JsonFieldComponent, NzCheckboxModule, NzInputModule, NzInputNumberModule, NzSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inspector.component.scss',
  templateUrl: './inspector.component.html',
})
export class InspectorComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);
  protected readonly expressionHint = '{{ … }}';

  protected readonly heading = computed(() => {
    const target = this.store.target();
    if (!target) return '';
    if (target.kind === 'node') return this.i18n.t('ed.type.' + target.type);
    return this.i18n.t('ed.' + target.kind);
  });

  protected readonly rows = computed<Row[]>(() => {
    const doc = this.store.doc();
    const path = this.store.selection();
    const target = this.store.target();
    const value = getIn(doc, path);
    if (!target || !isObject(value)) return [];
    const infos =
      target.kind === 'screen'
        ? screenProperties()
        : target.kind === 'node'
          ? nodeProperties(target.type)
          : definitionProperties(target.kind === 'tab' ? 'tab' : 'wizardStep');
    const issues = this.store.issues();
    return infos
      .filter((info) => info.kind !== 'children')
      .map((info) => {
        const propertyPath = [...path, info.name];
        const pointer = toPointer(propertyPath);
        return {
          info,
          value: value[info.name],
          path: propertyPath,
          id: 'prop-' + info.name,
          issues: issues.filter((i) => i.pointer === pointer || i.pointer.startsWith(pointer + '/')).map((i) => i.message),
        };
      });
  });

  protected readonly mainRows = computed(() => this.rows().filter((r) => !CONDITIONS.has(r.info.name)));
  protected readonly conditionRows = computed(() => this.rows().filter((r) => CONDITIONS.has(r.info.name)));
  /** Il gruppo delle condizioni si apre da solo se una condizione è impostata o ha problemi. */
  protected readonly conditionsOpen = computed(() => this.conditionRows().some((r) => r.value !== undefined || r.issues.length));
  /** Spiegazione comune delle espressioni, mostrata una volta in cima al gruppo invece che sotto ogni campo. */
  protected readonly expressionHelp = computed(() => this.conditionRows().find((r) => r.info.kind === 'expression')?.info.description ?? '');

  /** Problemi dell'elemento che non riguardano una proprietà precisa (proprietà obbligatorie mancanti, sconosciute). */
  protected readonly generalIssues = computed(() => {
    const selection = this.store.selection();
    const names = new Set(this.rows().map((r) => r.info.name));
    return this.store
      .issues()
      .filter((i) => samePath(i.owner, selection))
      .filter((i) => {
        const key = fromPointer(i.pointer)[selection.length];
        return key === undefined || !names.has(String(key));
      })
      .map((i) => i.message);
  });

  protected isLong(row: Row): boolean {
    return row.info.kind === 'expression' || LONG_TEXT.has(row.info.name) || (typeof row.value === 'string' && row.value.includes('{{'));
  }

  protected setText(row: Row, text: string): void {
    // Un testo vuoto toglie la proprietà facoltativa; quella obbligatoria resta (vuota), così lo schema la segnala.
    this.store.setValue(row.path, text === '' && !row.info.required ? undefined : text);
  }

  protected setNumber(row: Row, value: number | null): void {
    this.store.setValue(row.path, value === null || Number.isNaN(value) ? undefined : value);
  }

  protected setBoolean(row: Row, checked: boolean): void {
    // Il valore predefinito delle proprietà sì/no è «no»: deselezionare toglie la proprietà.
    this.store.setValue(row.path, checked ? true : undefined);
  }

  protected setOption(row: Row, option: string | null): void {
    this.store.setValue(row.path, option ?? undefined);
  }

  protected setJson(row: Row, value: Json | undefined): void {
    this.store.setValue(row.path, value);
  }

  protected asText(value: Json | undefined): string {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value);
  }

  protected asNumber(value: Json | undefined): number | null {
    return typeof value === 'number' ? value : null;
  }
}

