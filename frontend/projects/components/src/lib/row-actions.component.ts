import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ActionDefinition } from 'schema';
import { IconComponent } from './icon.component';

/**
 * Azioni di una riga (tabella e datatable): le prime `inline` azioni visibili sono pulsanti, le altre stanno nel menu «⋯».
 * Visibilità, abilitazione e testi si valutano con la riga in `row`; l'esecuzione resta al componente ospite (`run`).
 */
@Component({
  selector: 'lc-row-actions',
  imports: [IconComponent, NzButtonModule, NzDropdownModule, NzMenuModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .more { padding-inline: 6px; }
  `,
  template: `
    <div class="actions">
      @for (action of split().inline; track $index) {
        <span nz-tooltip [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, rowScope()) : null">
          <button nz-button nzSize="small" type="button" [disabled]="busy() || !runtime().isEnabled(action, rowScope())" (click)="run.emit(action)">
            {{ runtime().text(action.label, rowScope()) }}
          </button>
        </span>
      }
      @if (split().menu.length) {
        <button nz-button nzSize="small" nzType="text" class="more" type="button" nz-dropdown nzTrigger="click" nzPlacement="bottomRight" [nzDropdownMenu]="rowMenu"
          [disabled]="busy()" [attr.aria-label]="i18n.t('lc.moreActions')" aria-haspopup="menu">
          <lc-icon name="more" />
        </button>
        <nz-dropdown-menu #rowMenu="nzDropdownMenu">
          <ul nz-menu>
            @for (action of split().menu; track $index) {
              <li nz-menu-item class="lc-row-action" [nzDisabled]="!runtime().isEnabled(action, rowScope())" (click)="runtime().isEnabled(action, rowScope()) && run.emit(action)"
                nz-tooltip nzTooltipPlacement="left" [nzTooltipTitle]="action.tooltip ? runtime().text(action.tooltip, rowScope()) : null">
                {{ runtime().text(action.label, rowScope()) }}
              </li>
            }
          </ul>
        </nz-dropdown-menu>
      }
    </div>
  `,
})
export class RowActionsComponent {
  readonly actions = input.required<readonly ActionDefinition[]>();
  /** Quante azioni visibili mostrare come pulsanti; se manca, tutte. */
  readonly inline = input<number | undefined>(undefined);
  readonly row = input.required<Record<string, unknown>>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  readonly busy = input(false);
  readonly run = output<ActionDefinition>();

  protected readonly i18n = inject(I18n);
  protected readonly rowScope = computed<Scope>(() => ({ ...this.scope(), row: this.row() }));
  protected readonly split = computed(() => {
    const visible = this.actions().filter((action) => this.runtime().isVisible(action, this.rowScope()));
    const inline = this.inline();
    if (inline === undefined || visible.length <= inline) return { inline: visible, menu: [] as ActionDefinition[] };
    return { inline: visible.slice(0, inline), menu: visible.slice(inline) };
  });
}
