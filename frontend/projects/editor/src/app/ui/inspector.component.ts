import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { fromPointer, getIn, isObject, samePath, toPointer } from '../model/doc-ops';
import { EditorStore } from '../model/editor-store';
import { definitionProperties, nodeProperties, screenProperties, type PropertyInfo } from '../model/schema-info';
import { FieldsComponent } from './fields.component';

/** Proprietà raccolte nel gruppo «Condizioni e aiuto», chiuso se nessuna è impostata. */
const CONDITIONS = new Set(['visibleIf', 'hiddenIf', 'enabledIf', 'readOnlyIf', 'nextIf', 'tooltip']);

/**
 * Pannello delle proprietà dell'elemento selezionato (schermata, nodo, scheda o passo). I campi vengono dallo schema
 * (vedi `ed-fields`); le condizioni stanno in un gruppo a parte, aperto solo se ne è impostata una.
 */
@Component({
  selector: 'ed-inspector',
  imports: [FieldsComponent, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './inspector.component.scss',
  templateUrl: './inspector.component.html',
})
export class InspectorComponent {
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);

  protected readonly heading = computed(() => {
    const target = this.store.target();
    if (!target) return '';
    if (target.kind === 'node') return this.i18n.t('ed.type.' + target.type);
    return this.i18n.t('ed.' + target.kind);
  });

  private readonly properties = computed<PropertyInfo[]>(() => {
    const target = this.store.target();
    if (!target) return [];
    const all =
      target.kind === 'screen'
        ? screenProperties()
        : target.kind === 'node'
          ? nodeProperties(target.type)
          : definitionProperties(target.kind === 'tab' ? 'tab' : 'wizardStep');
    return all.filter((info) => info.kind !== 'children');
  });

  protected readonly main = computed(() => this.properties().filter((p) => !CONDITIONS.has(p.name)));
  protected readonly conditions = computed(() => this.properties().filter((p) => CONDITIONS.has(p.name)));

  /** Il gruppo delle condizioni si apre da solo se una condizione è impostata o ha problemi. */
  protected readonly conditionsOpen = computed(() => {
    const path = this.store.selection();
    const value = getIn(this.store.doc(), path);
    const names = this.conditions().map((p) => p.name);
    const pointers = names.map((n) => toPointer([...path, n]));
    return (isObject(value) && names.some((n) => value[n] !== undefined)) || this.store.issues().some((i) => pointers.includes(i.pointer));
  });

  /** Spiegazione comune delle espressioni, mostrata una volta in cima al gruppo invece che sotto ogni campo. */
  protected readonly expressionHelp = computed(() => this.conditions().find((p) => p.kind === 'expression')?.description ?? '');

  /** Problemi dell'elemento che non riguardano una proprietà mostrata (proprietà obbligatorie mancanti, sconosciute). */
  protected readonly generalIssues = computed(() => {
    const selection = this.store.selection();
    const names = new Set(this.properties().map((p) => p.name));
    return this.store
      .issues()
      .filter((i) => samePath(i.owner, selection))
      .filter((i) => {
        const key = fromPointer(i.pointer)[selection.length];
        return key === undefined || !names.has(String(key));
      })
      .map((i) => i.message);
  });
}
