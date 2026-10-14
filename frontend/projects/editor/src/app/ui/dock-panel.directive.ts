import { Directive, inject, input } from '@angular/core';
import { Dock, type DockPanel } from './dock';

/**
 * Segna l'elemento di un riquadro del lato (\`edDockPanel="outline"\`): fissato sta nella colonna (\`ed-docked\`),
 * sganciato galleggia sopra l'area centrale (\`ed-floating\`), visibile solo quando è aperto (\`ed-open\`). Gli stili
 * stanno in styles.scss, perché valgono per elementi di componenti diversi.
 */
@Directive({
  selector: '[edDockPanel]',
  host: {
    '[attr.id]': "'ed-panel-' + edDockPanel()",
    '[attr.data-dock-panel]': 'edDockPanel()',
    '[class.ed-docked]': 'dock.pinned[edDockPanel()]()',
    '[class.ed-floating]': '!dock.pinned[edDockPanel()]()',
    '[class.ed-open]': 'dock.isOpen(edDockPanel())',
  },
})
export class DockPanelDirective {
  readonly edDockPanel = input.required<DockPanel>();
  protected readonly dock = inject(Dock);
}
