import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n, rowsOf, type ScreenRuntime, type Scope } from 'core';
import { BusyComponent } from './busy.component';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzTimelineModule } from 'ng-zorro-antd/timeline';
import type { TimelineNode } from 'schema';
import { TONE_COLORS } from './display.component';

type Row = Record<string, unknown>;

/**
 * Events of a data source in date order (newest first, or oldest first with `order: asc`): date, title,
 * description and colour according to `toneField`/`tones`. Rows without a valid date are not shown.
 */
@Component({
  selector: 'lc-timeline',
  imports: [BusyComponent, NzAlertModule, NzTimelineModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    time { display: block; font-size: 12px; color: var(--lc-color-muted, #5d6b7a); }
    .title { font-weight: 600; }
    .description { margin: 2px 0 0; font-size: 13px; }
    .empty { color: var(--lc-color-muted, #5d6b7a); margin: 0; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      <lc-busy [busy]="source().status === 'loading'" [empty]="!events().length">
      @if (events().length) {
      <nz-timeline>
        @for (event of events(); track $index) {
          <nz-timeline-item [nzColor]="event.color">
            <time [attr.datetime]="event.iso">{{ event.when }}</time>
            <span class="title">{{ event.title }}</span>
            @if (event.description) {
              <p class="description">{{ event.description }}</p>
            }
          </nz-timeline-item>
        }
      </nz-timeline>
      } @else if (source().status !== 'loading') {
        <p class="empty">{{ i18n.t('lc.noData') }}</p>
      }
      </lc-busy>
    }
  `,
})
export class TimelineComponent {
  readonly node = input.required<TimelineNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});
  protected readonly i18n = inject(I18n);

  protected readonly source = computed(() => this.runtime().source(this.node().source));

  protected readonly events = computed(() => {
    const node = this.node();
    const format = new Intl.DateTimeFormat(this.i18n.intlLocale(), node.withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
    const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
    const events = rowsOf(this.source().data)
      .map((row: Row) => {
        const iso = text(row[node.dateField]);
        // A date without time is a day: it is read in local time, not as UTC midnight.
        const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
        const tone = node.toneField ? node.tones?.[text(row[node.toneField])] : undefined;
        return {
          time: date.getTime(),
          iso,
          when: Number.isNaN(date.getTime()) ? '' : format.format(date),
          title: text(row[node.labelField]),
          description: node.descriptionField ? text(row[node.descriptionField]) : '',
          color: TONE_COLORS[tone ?? 'primary'],
        };
      })
      .filter((e) => !Number.isNaN(e.time));
    return events.sort((a, b) => (node.order === 'asc' ? a.time - b.time : b.time - a.time));
  });
}
