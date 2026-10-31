import type { CommentsNode } from 'schema';
import { initials } from './kanban-board';

type Row = Record<string, unknown>;

export interface ThreadComment {
  author: string;
  initials: string;
  /** Restricted Markdown, from the data: shown through `lc-markdown`, never evaluated. */
  text: string;
  /** The date as it came, for `<time datetime>`; empty when it is not valid. */
  iso: string;
  time: number | null;
}

const textOf = (value: unknown): string => (value === null || value === undefined || typeof value === 'object' ? '' : String(value));

/**
 * The comments of the rows in date order (`order`: oldest first by default); rows without a valid date keep their order
 * after the others, and rows without text are left out.
 */
export function threadOf(rows: readonly Row[], node: CommentsNode): ThreadComment[] {
  const comments = rows
    .map((row) => {
      const iso = textOf(row[node.dateField ?? 'date']);
      const time = iso ? new Date(iso).getTime() : NaN;
      const author = textOf(row[node.authorField ?? 'author']);
      return { author, initials: initials(author), text: textOf(row[node.textField ?? 'text']), iso: Number.isNaN(time) ? '' : iso, time: Number.isNaN(time) ? null : time };
    })
    .filter((c) => c.text.trim() !== '');
  const dated = comments.filter((c) => c.time !== null).sort((a, b) => (node.order === 'desc' ? b.time! - a.time! : a.time! - b.time!));
  return [...dated, ...comments.filter((c) => c.time === null)];
}

/** The people mentioned who are still in the text: the values of the chosen labels whose `@label` appears, once each. */
export function mentionsIn(text: string, chosen: ReadonlyMap<string, string>): string[] {
  const values = new Set<string>();
  for (const [label, value] of chosen) if (text.includes(`@${label}`)) values.add(value);
  return [...values];
}
