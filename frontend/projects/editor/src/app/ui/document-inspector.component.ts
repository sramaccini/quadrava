import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DATASOURCES_SCHEMA } from 'schema';
import { DocumentState } from '../model/document-state';
import { PROJECT } from '../model/project-store';
import { SchemaReader, type Schema } from '../model/schema-info';
import { DockPinComponent } from './dock-pin.component';
import { FieldsComponent } from './fields.component';

const DATASOURCES = new SchemaReader(DATASOURCES_SCHEMA as unknown as Schema);

/**
 * The properties of a document edited as a whole, with the fields generated from its schema: the manifest of the project
 * (name, languages, default language, themes) or a data sources document (identifier and description; its data sources are
 * edited in the window). A side panel of the workspace: it shows the document of the active window.
 */
@Component({
  selector: 'ed-document-inspector',
  imports: [DockPinComponent, FieldsComponent, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; }
    .ed-panel { flex: 1 1 auto; }
    .note { margin: 0 0 12px; font-size: 12px; color: var(--lc-color-muted); }
    .issues { margin: 0 0 12px; padding-left: 18px; color: var(--lc-color-danger); font-size: 12px; }
  `,
  template: `
    <section class="ed-panel" [attr.aria-label]="i18n.t('ed.inspector')">
      <h2 class="ed-panel-title"><span nz-icon nzType="control" aria-hidden="true"></span>{{ i18n.t('ed.inspector') }}<ed-dock-pin panel="inspector" /></h2>
      <div class="ed-panel-body">
        <p class="note">{{ i18n.t('ed.inspectorNote.' + kind()) }}</p>
        @if (rootIssues().length) {
          <ul class="issues" role="alert">
            @for (message of rootIssues(); track $index) {
              <li>{{ message }}</li>
            }
          </ul>
        }
        <ed-fields [path]="[]" [fields]="fields()" />
      </div>
    </section>
  `,
})
export class DocumentInspectorComponent {
  readonly kind = input.required<'project' | 'datasources'>();
  protected readonly i18n = inject(I18n);
  private readonly store = inject(DocumentState);
  protected readonly fields = computed(() =>
    this.kind() === 'project' ? PROJECT.rootProperties() : DATASOURCES.rootProperties().filter((p) => p.name !== 'sources'),
  );
  /** Problems of the document that are not shown next to a field (for example in the data sources, edited in the window). */
  protected readonly rootIssues = computed(() => {
    const names = new Set(this.fields().map((f) => f.name));
    return this.store
      .issues()
      .filter((i) => !names.has(i.pointer.split('/')[1] ?? ''))
      .map((i) => `${i.pointer} ${i.message}`);
  });
}
