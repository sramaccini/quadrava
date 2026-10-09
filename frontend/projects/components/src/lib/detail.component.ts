import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, formatValue, type FormatLabels, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTagModule } from 'ng-zorro-antd/tag';
import type { ColumnDefinition, DetailNode } from 'schema';
import { TONE_COLORS } from './shared';

/**
 * Scheda di dettaglio in sola lettura: un record mostrato come coppie etichetta e valore.
 * Il data source `source` deve restituire un oggetto; ogni campo usa gli stessi formati delle colonne di una tabella.
 */
@Component({
  selector: 'lc-detail',
  imports: [NzCardModule, NzDescriptionsModule, NzTagModule, NzAlertModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nz-card role="region" [attr.aria-label]="node().title ? runtime().text(node().title, scope()) : null" [attr.aria-busy]="source().status === 'loading'" [nzTitle]="node().title ? runtime().text(node().title, scope())  : undefined">
      @if (source().status === 'error') {
        <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
      } @else if (record(); as rec) {
        <nz-descriptions nzBordered nzSize="small" [nzColumn]="{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }">
          @for (field of fields(); track field.field) {
            <nz-descriptions-item [nzTitle]="runtime().text(field.label, scope()) || field.field">
              @if (view(rec, field); as v) {
                @if (v.tone) {
                  <nz-tag [nzColor]="color(v.tone)">{{ v.text }}</nz-tag>
                } @else {
                  {{ v.text || '—' }}
                }
              }
            </nz-descriptions-item>
          }
        </nz-descriptions>
      } @else if (source().status === 'ready') {
        <p role="status">{{ i18n.t('lc.noData') }}</p>
      } @else {
        <p role="status">{{ i18n.t('lc.loading') }}</p>
      }
    </nz-card>
  `,
})
export class DetailComponent {
  readonly node = input.required<DetailNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  private readonly labels = (): FormatLabels => ({ yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key, fallback) => this.i18n.t(key, {}, fallback) });
  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly fields = computed(() => this.node().fields.filter((f) => this.runtime().isVisible(f, this.scope())));
  protected readonly record = computed<Record<string, unknown> | null>(() => {
    const data = this.source().data;
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  });

  protected view(record: Record<string, unknown>, field: ColumnDefinition): FormattedValue {
    return formatValue(record[field.field], field, this.i18n.intlLocale(), this.labels());
  }

  protected color(tone: NonNullable<FormattedValue['tone']>): string {
    return TONE_COLORS[tone];
  }
}
