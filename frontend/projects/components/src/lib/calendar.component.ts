import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, runSteps, type ScreenRuntime, type Scope } from 'core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCalendarModule } from 'ng-zorro-antd/calendar';
import type { CalendarNode, Tone } from 'schema';
import { IconComponent } from './icon.component';

type Row = Record<string, unknown>;

const TONE_VARS: Record<Tone, string> = {
  neutral: 'var(--lc-color-muted, #5d6b7a)',
  primary: 'var(--lc-color-primary, #1f5fbf)',
  success: 'var(--lc-color-success, #2e7d32)',
  danger: 'var(--lc-color-danger, #c62828)',
};

const pad = (n: number): string => String(n).padStart(2, '0');
/** Giorno locale di una data come `AAAA-MM-GG`. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** Giorno di un valore di riga: `AAAA-MM-GG`, anche seguito dall'ora; altrimenti null. */
export function rowDay(value: unknown): string | null {
  const m = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return m ? m[1] : null;
}
/** Mese `AAAA-MM` → primo giorno del mese; null se il testo non è un mese valido. */
export function parseMonth(value: unknown): Date | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

/**
 * Calendario mensile con gli eventi di un data source nei giorni. Il mese visibile sta nello stato (`bind`, `AAAA-MM`),
 * così il data source può caricare solo quel mese; senza `bind` è locale. Al massimo `maxPerDay` eventi per giorno
 * (gli altri diventano «+n»); il clic su un evento esegue `onSelect` con l'evento in `row`.
 */
@Component({
  selector: 'lc-calendar',
  imports: [IconComponent, NzAlertModule, NzButtonModule, NzCalendarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .header { display: flex; align-items: center; gap: 8px; padding: 0 0 12px; }
    .header h3 { margin: 0 8px; font-size: 16px; font-weight: 600; min-width: 160px; text-transform: capitalize; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { line-height: 1.4; }
    .event { display: flex; align-items: center; gap: 6px; width: 100%; padding: 1px 2px; border: 0; background: none; font: inherit; font-size: 12px;
      color: var(--lc-color-on-surface, #1b2430); text-align: left; cursor: pointer; border-radius: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .event:hover, .event:focus-visible { background: color-mix(in srgb, var(--lc-color-primary, #1f5fbf) 10%, transparent); }
    .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
    .label { overflow: hidden; text-overflow: ellipsis; }
    .more { font-size: 12px; color: var(--lc-color-muted, #5d6b7a); padding-left: 16px; }
  `,
  template: `
    @if (source().status === 'error') {
      <div role="alert"><nz-alert nzType="error" [nzMessage]="source().error ?? null" nzShowIcon /></div>
    } @else {
      <nz-calendar [nzValue]="value()" [nzDateCell]="cell" [nzCustomHeader]="header" (nzValueChange)="pick($event)" [attr.aria-busy]="source().status === 'loading'" />
      <ng-template #header>
        <div class="header">
          <button nz-button type="button" [attr.aria-label]="i18n.t('lc.previousMonth')" (click)="shift(-1)"><lc-icon name="left" /></button>
          <h3 aria-live="polite">{{ title() }}</h3>
          <button nz-button type="button" [attr.aria-label]="i18n.t('lc.nextMonth')" (click)="shift(1)"><lc-icon name="right" /></button>
          <button nz-button type="button" (click)="today()">{{ i18n.t('lc.today') }}</button>
        </div>
      </ng-template>
      <ng-template #cell let-date>
        @let events = byDay().get(key(date)) ?? [];
        @if (events.length) {
          <ul>
            @for (row of events.slice(0, max()); track $index) {
              <li>
                <button type="button" class="event" [attr.aria-label]="label(row) + ', ' + dateText(date)" (click)="$event.stopPropagation(); select(row)">
                  <span class="dot" [style.background]="color(row)"></span><span class="label">{{ label(row) }}</span>
                </button>
              </li>
            }
          </ul>
          @if (events.length > max()) {
            <span class="more">{{ i18n.t('lc.moreEvents', { n: events.length - max() }) }}</span>
          }
        }
      </ng-template>
    }
  `,
})
export class CalendarComponent {
  readonly node = input.required<CalendarNode>();
  readonly runtime = input.required<ScreenRuntime>();
  readonly scope = input<Scope>({});

  protected readonly i18n = inject(I18n);
  private readonly local = signal<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  private busy = false;

  protected readonly source = computed(() => this.runtime().source(this.node().source));
  protected readonly max = computed(() => this.node().maxPerDay ?? 3);

  /** Primo giorno del mese visibile: dallo stato (`bind`) se valido, altrimenti locale. */
  protected readonly month = computed<Date>(() => {
    const bind = this.node().bind;
    return (bind ? parseMonth(this.runtime().getState(bind)) : null) ?? this.local();
  });
  /** Giorno evidenziato da NG-ZORRO: oggi nel mese corrente, altrimenti il primo del mese. */
  protected readonly value = computed<Date>(() => {
    const month = this.month();
    const now = new Date();
    return now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth() ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : month;
  });
  protected readonly title = computed(() => new Intl.DateTimeFormat(this.i18n.intlLocale(), { month: 'long', year: 'numeric' }).format(this.month()));

  /** Eventi per giorno (`AAAA-MM-GG`), nell'ordine del servizio. */
  protected readonly byDay = computed(() => {
    const map = new Map<string, Row[]>();
    const data = this.source().data;
    const rows = Array.isArray(data) ? (data as Row[]) : Array.isArray((data as { items?: unknown } | null)?.items) ? ((data as { items: Row[] }).items) : [];
    for (const row of rows) {
      const day = rowDay(row[this.node().dateField]);
      if (!day) continue;
      const list = map.get(day) ?? [];
      list.push(row);
      map.set(day, list);
    }
    return map;
  });

  protected key(date: Date): string {
    return dayKey(date);
  }

  protected dateText(date: Date): string {
    return new Intl.DateTimeFormat(this.i18n.intlLocale(), { dateStyle: 'long' }).format(date);
  }

  protected label(row: Row): string {
    const value = row[this.node().labelField];
    return value === null || value === undefined ? '' : String(value);
  }

  protected color(row: Row): string {
    const field = this.node().badgeField;
    const raw = field ? String(row[field] ?? '') : '';
    const badges = this.node().badges ?? {};
    const tone = Object.prototype.hasOwnProperty.call(badges, raw) ? badges[raw] : 'primary';
    return TONE_VARS[tone];
  }

  private setMonth(date: Date): void {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const bind = this.node().bind;
    if (bind) this.runtime().setState(bind, `${first.getFullYear()}-${pad(first.getMonth() + 1)}`);
    else this.local.set(first);
  }

  protected shift(delta: number): void {
    const current = this.month();
    this.setMonth(new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  protected today(): void {
    this.setMonth(new Date());
  }

  /** Clic su un giorno: se è di un altro mese (i giorni in grigio), il calendario passa a quel mese. */
  protected pick(date: Date): void {
    const current = this.month();
    if (date.getFullYear() !== current.getFullYear() || date.getMonth() !== current.getMonth()) this.setMonth(date);
  }

  protected async select(row: Row): Promise<void> {
    const steps = this.node().onSelect;
    if (!steps || this.busy) return;
    this.busy = true;
    try {
      await runSteps(this.runtime(), steps, { ...this.scope(), row });
    } finally {
      this.busy = false;
    }
  }
}
