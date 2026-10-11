import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import type { DocumentState, EditorIssue } from '../model/document-state';
import { EditorStore } from '../model/editor-store';

/** Elenco dei problemi del documento aperto (schermata o navigazione): un clic seleziona l'elemento a cui appartiene. */
@Component({
  selector: 'ed-issues',
  imports: [NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    ul { list-style: none; margin: 0; padding: 0; }
    button {
      display: flex; gap: 8px; align-items: baseline; width: 100%; padding: 3px 12px; border: 0; background: none;
      color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer;
    }
    button:hover { background: color-mix(in srgb, var(--lc-color-on-surface) 6%, transparent); }
    button:focus-visible { outline: 2px solid var(--lc-color-primary); outline-offset: -2px; }
    .error [nz-icon] { color: var(--lc-color-danger); }
    .warning [nz-icon] { color: var(--lc-color-warning, #d48806); }
    .pointer { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--lc-color-muted); }
    .none { padding: 3px 12px; font-size: 12px; color: var(--lc-color-muted); }
  `,
  template: `
    <ul [attr.aria-label]="i18n.t('ed.issues')">
      @for (issue of state().issues(); track $index) {
        <li [class]="issue.severity">
          <button type="button" (click)="open(issue)">
            <span nz-icon [nzType]="issue.severity === 'error' ? 'close-circle' : 'warning'" [attr.aria-label]="i18n.t('ed.severity.' + issue.severity)"></span>
            <span class="pointer">{{ issue.pointer }}</span>
            <span>{{ issue.message }}</span>
          </button>
        </li>
      } @empty {
        <li class="none">{{ i18n.t('ed.issues.none') }}</li>
      }
    </ul>
  `,
})
export class IssuesComponent {
  readonly state = input.required<DocumentState>();
  protected readonly i18n = inject(I18n);

  protected open(issue: EditorIssue): void {
    const state = this.state();
    // I data source della schermata non sono nella struttura: si apre il loro pannello.
    if (state instanceof EditorStore && issue.pointer.startsWith('/dataSources')) state.view.set('sources');
    else state.select(issue.owner);
  }
}
