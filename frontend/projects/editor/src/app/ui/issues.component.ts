import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from 'core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { EditorStore, type EditorIssue } from '../model/editor-store';

/** Elenco dei problemi del documento: un clic seleziona l'elemento a cui appartiene. */
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
      @for (issue of store.issues(); track $index) {
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
  protected readonly store = inject(EditorStore);
  protected readonly i18n = inject(I18n);

  protected open(issue: EditorIssue): void {
    // I data source non sono nella struttura: si apre il loro pannello.
    if (issue.pointer.startsWith('/dataSources')) this.store.view.set('sources');
    else this.store.select(issue.owner);
  }
}
