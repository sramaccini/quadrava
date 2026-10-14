import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import type { SectionNode } from 'schema';
import { IconComponent } from './icon.component';

/**
 * Strumenti facoltativi nell'intestazione delle sezioni: «JSON» (la definizione della sezione) e «Aiuto» (sui
 * componenti che contiene). Li fornisce l'applicazione (per esempio una vetrina di esempi); senza, le sezioni non
 * mostrano nulla in più.
 */
export abstract class SectionTools {
  /** Se la sezione mostra gli strumenti. */
  abstract applies(section: SectionContext): boolean;
  abstract showSource(section: SectionContext): void;
  abstract showHelp(section: SectionContext): void;
}

/** La sezione a cui si riferiscono gli strumenti: definizione, schermata e titolo già tradotto. */
export interface SectionContext {
  node: SectionNode;
  runtime: ScreenRuntime;
  title: string | null;
}

@Component({
  selector: 'lc-section',
  imports: [NodeHostComponent, NzCardModule, NzButtonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Affiancata ad altre in un box o in una griglia, la scheda si allunga fino all'altezza della riga. */
    :host { display: block; height: 100%; }
    nz-card { height: 100%; }
    .body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
    /* Affiancati: da 200 a 360px ciascuno, a capo quando manca spazio, allineati in basso. */
    .body.row { flex-direction: row; flex-wrap: wrap; align-items: flex-end; }
    .body.row > lc-node { flex: 1 1 200px; max-width: 360px; --lc-input-max: none; }
    .tools { display: inline-flex; gap: 2px; }
    .tools button { color: var(--lc-color-muted); }
    .tools button:hover { color: var(--lc-color-primary); }
    .tools lc-icon { margin-right: 4px; }
  `,
  template: `
    <nz-card
      role="region"
      [attr.aria-label]="title()"
      [nzTitle]="title() ?? undefined"
      [nzExtra]="tools() ? toolbar : undefined"
    >
      <div class="body" [class.row]="node().layout === 'row'">
        @for (child of node().components; track $index) {
          <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
        }
      </div>
    </nz-card>
    <ng-template #toolbar>
      <span class="tools">
        <button nz-button nzType="text" nzSize="small" type="button" [attr.aria-label]="label('lc.section.source')" (click)="tools()!.showSource(context())">
          <lc-icon name="code" />JSON
        </button>
        <button nz-button nzType="text" nzSize="small" type="button" [attr.aria-label]="label('lc.section.help')" (click)="tools()!.showHelp(context())">
          <lc-icon name="help" />{{ i18n.t('lc.section.helpShort') }}
        </button>
      </span>
    </ng-template>
  `,
})
export class SectionComponent {
  readonly node = input.required<SectionNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);
  private readonly sectionTools = inject(SectionTools, { optional: true });

  protected readonly title = computed(() => (this.node().title ? this.runtime().text(this.node().title, this.scope()) : null));
  protected readonly context = computed<SectionContext>(() => ({ node: this.node(), runtime: this.runtime(), title: this.title() }));
  protected readonly tools = computed(() => (this.sectionTools?.applies(this.context()) ? this.sectionTools : null));

  /** Nome accessibile dei pulsanti: dice di quale sezione si parla. */
  protected label(key: string): string {
    return this.i18n.t(key, { title: this.title() ?? '' });
  }
}
