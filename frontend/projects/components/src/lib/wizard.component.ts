import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { I18n, NodeHostComponent, type ScreenRuntime, type Scope } from 'core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import type { WizardNode } from 'schema';
import { nextId } from './shared';

/**
 * Procedura a passi: indicatore dei passi, contenuto del passo corrente, Indietro e Avanti. Il passo corrente sta
 * nello stato della schermata (`bind`), così anche un pulsante dentro un passo può spostarlo con `set`; senza `bind`
 * è locale. Avanti è abilitato solo se `nextIf` del passo è vero (fail-closed); l'ultimo passo non ha Avanti.
 */
@Component({
  selector: 'lc-wizard',
  imports: [NodeHostComponent, NzButtonModule, NzStepsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    nz-steps { margin-bottom: 20px; }
    .body { display: flex; flex-direction: column; gap: var(--lc-gap, 12px); }
    .nav { display: flex; gap: var(--lc-gap, 12px); margin-top: 20px; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `,
  template: `
    <nz-steps [nzCurrent]="current()" nzSize="small" [attr.aria-hidden]="true">
      @for (step of node().steps; track $index) {
        <nz-step [nzTitle]="runtime().text(step.label, scope())" [nzDescription]="step.description ? runtime().text(step.description, scope()) : undefined" />
      }
    </nz-steps>
    <section class="body" role="region" [attr.aria-labelledby]="headingId">
      <h3 class="visually-hidden" [id]="headingId" aria-live="polite">
        {{ i18n.t('lc.stepOf', { n: current() + 1, total: node().steps.length }) }}: {{ runtime().text(step().label, scope()) }}
      </h3>
      @for (child of step().components; track $index) {
        <lc-node [node]="child" [runtime]="runtime()" [scope]="scope()" />
      }
    </section>
    <div class="nav">
      @if (current() > 0) {
        <button nz-button type="button" (click)="go(current() - 1)">{{ node().backLabel ? runtime().text(node().backLabel, scope()) : i18n.t('lc.back') }}</button>
      }
      @if (current() < node().steps.length - 1) {
        <button nz-button nzType="primary" type="button" [disabled]="!canGoOn()" (click)="go(current() + 1)">
          {{ node().nextLabel ? runtime().text(node().nextLabel, scope()) : i18n.t('lc.next') }}
        </button>
      }
    </div>
  `,
})
export class WizardComponent {
  readonly node = input.required<WizardNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  protected readonly headingId = nextId('lc-wizard');
  /** Passo corrente senza stato condiviso (nessun \`bind\`). */
  private readonly local = linkedSignal(() => (this.node(), 0));

  /** Passo corrente, sempre dentro i limiti: un valore estraneo nello stato vale come il primo passo. */
  protected readonly current = computed(() => {
    const bind = this.node().bind;
    const raw = bind ? this.runtime().getState(bind) : this.local();
    const last = this.node().steps.length - 1;
    return typeof raw === 'number' && Number.isInteger(raw) ? Math.min(Math.max(raw, 0), last) : 0;
  });
  protected readonly step = computed(() => this.node().steps[this.current()]);
  protected readonly canGoOn = computed(() =>
    this.runtime().engine.evaluateCondition(this.step().nextIf, this.runtime().context(this.scope()), { whenMissing: true }),
  );

  protected go(index: number): void {
    const bind = this.node().bind;
    if (bind) this.runtime().setState(bind, index);
    else this.local.set(index);
  }
}
