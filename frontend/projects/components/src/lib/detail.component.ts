import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { MarkdownComponent } from './markdown.component';
import { I18n, formatValue, type FormatLabels, type FormattedValue, type ScreenRuntime, type Scope } from 'core';
import { BusyComponent } from './busy.component';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { ColumnDefinition, DetailNode } from 'schema';
import { IconComponent } from './icon.component';
import { FormattedValueComponent } from './formatted-value.component';
import { TONE_COLORS } from './shared';

/** Under this width the panel has one column, label above value; under WIDE two columns, otherwise three. */
const NARROW = 480;
const WIDE = 840;

/**
 * Read-only detail panel: a record shown as label and value pairs.
 * The `source` data source must return an object; every field uses the same formats as the columns of a table.
 * The number of columns follows the width of the panel, not of the window: in a narrow side column (under 480 px) the
 * fields go one under the other, the label above the value.
 */
@Component({
  selector: 'lc-detail',
  imports: [BusyComponent, FormattedValueComponent, MarkdownComponent, IconComponent, NzCardModule, NzDescriptionsModule, NzTagModule, NzAlertModule, NzTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .help { display: inline-flex; margin-left: 4px; color: var(--lc-color-muted, #5d6b7a); cursor: help; vertical-align: -1px; }
    .help:focus-visible { outline: 2px solid var(--lc-focus-ring, var(--lc-color-primary, #1f5fbf)); outline-offset: 2px; border-radius: 50%; }
  `,
  template: `
    <nz-card role="region" [attr.aria-label]="node().title ? runtime().text(node().title, scope()) : null" [nzTitle]="node().title ? runtime().text(node().title, scope())  : undefined">
      @if (source().status === 'error') {
        <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
      } @else {
      <lc-busy [busy]="source().status === 'loading'" [empty]="!record()">
      @if (record(); as rec) {
        <nz-descriptions nzBordered nzSize="small" [nzColumn]="columns()" [nzLayout]="narrow() ? 'vertical' : 'horizontal'">
          @for (field of fields(); track field.field) {
            <ng-template #title>
              {{ runtime().text(field.label, scope()) || field.field }}
              @if (tip(field); as text) {
                <!-- Help icon reachable from the keyboard: the text is also its name for screen readers. -->
                <span class="help" tabindex="0" role="img" [attr.aria-label]="text" nz-tooltip [nzTooltipTitle]="text"><lc-icon name="help" /></span>
              }
            </ng-template>
            <nz-descriptions-item [nzTitle]="title">
              @if (field.format === 'markdown') {
                <lc-markdown [source]="markdownOf(rec, field)" />
              } @else if (view(rec, field); as v) {
                @if (v.tone) {
                  <nz-tag [nzColor]="color(v.tone)">{{ v.text }}</nz-tag>
                } @else {
                  @if (v.text) {
                    <lc-formatted-value [value]="v" />
                  } @else {
                    —
                  }
                }
              }
            </nz-descriptions-item>
          }
        </nz-descriptions>
      } @else if (source().status === 'ready') {
        <p role="status">{{ i18n.t('lc.noData') }}</p>
      }
      </lc-busy>
      }
    </nz-card>
  `,
})
export class DetailComponent {
  readonly node = input.required<DetailNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  /** Width of the panel, 0 until measured (then the columns follow the window, as before). */
  private readonly width = signal(0);
  protected readonly narrow = computed(() => this.width() > 0 && this.width() < NARROW);
  protected readonly columns = computed(() => {
    const width = this.width();
    if (!width) return { xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 };
    return width < NARROW ? 1 : width < WIDE ? 2 : 3;
  });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver((entries) => this.width.set(Math.round(entries[0]?.contentRect.width ?? 0)));
      observer.observe(host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
  private readonly labels = (): FormatLabels => ({ yes: this.i18n.t('lc.yes'), no: this.i18n.t('lc.no'), translate: (key, fallback) => this.i18n.t(key, {}, fallback) });
  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly fields = computed(() => this.node().fields.filter((f) => this.runtime().isVisible(f, this.scope())));
  protected readonly record = computed<Record<string, unknown> | null>(() => {
    const data = this.source().data;
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  });

  /** Value of a field with markdown format, as text (null and other types → empty). */
  protected markdownOf(record: Record<string, unknown>, field: { field: string }): string {
    const value = record[field.field];
    return typeof value === 'string' ? value : '';
  }

  protected view(record: Record<string, unknown>, field: ColumnDefinition): FormattedValue {
    return formatValue(record[field.field], field, this.i18n.intlLocale(), this.labels());
  }

  /** Help text of a field, already resolved; null if the field has none. */
  protected tip(field: ColumnDefinition): string | null {
    return field.tooltip ? this.runtime().text(field.tooltip, this.scope()) || null : null;
  }

  protected color(tone: NonNullable<FormattedValue['tone']>): string {
    return TONE_COLORS[tone];
  }
}
