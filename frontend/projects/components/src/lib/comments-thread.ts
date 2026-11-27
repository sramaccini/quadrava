import type { CommentsNode } from 'schema';
import { initials } from './kanban-board';

type Row = Record<string, unknown>;

/** What a row of the feed is: a comment, the change of a field (`changes`) or time spent (`workLog`). */
export type ThreadKind = 'comment' | 'change' | 'worklog';

/** The rows a chip keeps: those of some kinds of the feed, or with some values of `kindField`; all without either. */
export interface ThreadFilter {
  kinds?: readonly ThreadKind[];
  values?: readonly string[];
}

export interface ThreadComment {
  kind: ThreadKind;
  /** The value of `kindField` as it came (empty without it), for the chips of the screen. */
  rawKind: string;
  author: string;
  initials: string;
  /** Restricted Markdown, from the data: shown through `lc-markdown`, never evaluated. */
  text: string;
  /** The date as it came, for `<time datetime>`; empty when it is not valid. */
  iso: string;
  time: number | null;
  /** The field of `editedField` has a value. */
  edited: boolean;
  /** The row as it came, for the steps of `onEdit` and `onDelete` and their conditions. */
  row: Row;
  /** A change: the name of the field and the values before and after, as they came. */
  change?: { field: string; from: unknown; to: unknown };
  /** A work log: the minutes spent, null when the value is not a number. */
  minutes?: number | null;
}

const textOf = (value: unknown): string => (value === null || value === undefined || typeof value === 'object' ? '' : String(value));

/**
 * The comments of the rows in date order (`order`: oldest first by default); rows without a valid date keep their order
 * after the others, and comments without text are left out. With `kindField` the rows of the kind of `changes` and of
 * `workLog` are changes and work logs (a work log without text stays, a change has none).
 */
export function threadOf(rows: readonly Row[], node: CommentsNode, order: 'asc' | 'desc' = node.order ?? 'asc'): ThreadComment[] {
  const comments = rows
    .map((row) => {
      const iso = textOf(row[node.dateField ?? 'date']);
      const time = iso ? new Date(iso).getTime() : NaN;
      const author = textOf(row[node.authorField ?? 'author']);
      const edited = node.editedField !== undefined && row[node.editedField] !== undefined && row[node.editedField] !== null && row[node.editedField] !== false && row[node.editedField] !== '';
      const kind = kindOf(row, node);
      const item: ThreadComment = { kind, rawKind: node.kindField ? textOf(row[node.kindField]) : '', author, initials: initials(author), text: kind === 'change' ? '' : textOf(row[node.textField ?? 'text']), iso: Number.isNaN(time) ? '' : iso, time: Number.isNaN(time) ? null : time, edited, row };
      if (kind === 'change') {
        const c = node.changes ?? {};
        item.change = { field: textOf(row[c.fieldField ?? 'field']), from: row[c.fromField ?? 'from'], to: row[c.toField ?? 'to'] };
      } else if (kind === 'worklog') {
        const minutes = row[node.workLog?.minutesField ?? 'minutes'];
        item.minutes = typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : null;
      }
      return item;
    })
    .filter((c) => c.kind !== 'comment' || c.text.trim() !== '');
  const dated = comments.filter((c) => c.time !== null).sort((a, b) => (order === 'desc' ? b.time! - a.time! : a.time! - b.time!));
  return [...dated, ...comments.filter((c) => c.time === null)];
}

/** The kind of a row: by `kindField`, when the feed has `changes` or `workLog` of that kind; a comment otherwise. */
function kindOf(row: Row, node: CommentsNode): ThreadKind {
  if (!node.kindField) return 'comment';
  const kind = textOf(row[node.kindField]);
  if (node.changes && kind === (node.changes.kind ?? 'change')) return 'change';
  if (node.workLog && kind === (node.workLog.kind ?? 'worklog')) return 'worklog';
  return 'comment';
}

/** The items a chip keeps. */
export function filterThread(items: readonly ThreadComment[], filter: ThreadFilter): ThreadComment[] {
  return items.filter((item) => (!filter.kinds || filter.kinds.includes(item.kind)) && (!filter.values || filter.values.includes(item.rawKind)));
}

/** Minutes as hours and minutes in the language of the user: «2 hr 30 min», «45 min», «3 hr». */
export function durationText(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes));
  const unit = (value: number, name: 'hour' | 'minute'): string => new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return [hours ? unit(hours, 'hour') : '', rest || !hours ? unit(rest, 'minute') : ''].filter(Boolean).join(' ');
}

/** The people mentioned who are still in the text: the values of the chosen labels whose `@label` appears, once each. */
export function mentionsIn(text: string, chosen: ReadonlyMap<string, string>): string[] {
  const values = new Set<string>();
  for (const [label, value] of chosen) if (text.includes(`@${label}`)) values.add(value);
  return [...values];
}
