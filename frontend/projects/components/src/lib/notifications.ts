/** A message for the user, as the service of the application lists it (ADR-22). Texts are shown as plain text. */
export interface UserNotification {
  id: string;
  title: string;
  text?: string;
  /** ISO 8601. */
  date?: string;
  read: boolean;
  /** Screen of the application the message opens, with its parameters. */
  screen?: string;
  params?: Record<string, string | number | boolean>;
}

const MAX_TEXT = 2000;

/**
 * The messages of a reply of the service: an array of objects with a text `id` and `title`; anything else is left out
 * (fail-closed). Unknown fields are dropped, values of `params` other than text, number or yes/no too. Newest first when
 * dated, the others after them in the order received.
 */
export function notificationsOf(reply: unknown): UserNotification[] {
  if (!Array.isArray(reply)) return [];
  const out: UserNotification[] = [];
  const seen = new Set<string>();
  for (const entry of reply) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e['id'] !== 'string' || !e['id'] || typeof e['title'] !== 'string' || !e['title'] || seen.has(e['id'])) continue;
    seen.add(e['id']);
    const item: UserNotification = { id: e['id'], title: e['title'].slice(0, MAX_TEXT), read: e['read'] === true };
    if (typeof e['text'] === 'string' && e['text']) item.text = e['text'].slice(0, MAX_TEXT);
    if (typeof e['date'] === 'string' && !Number.isNaN(Date.parse(e['date']))) item.date = e['date'];
    if (typeof e['screen'] === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(e['screen'])) {
      item.screen = e['screen'];
      const params = e['params'];
      if (params && typeof params === 'object' && !Array.isArray(params)) {
        const kept = Object.entries(params).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v));
        if (kept.length) item.params = Object.fromEntries(kept) as UserNotification['params'];
      }
    }
    out.push(item);
  }
  const time = (n: UserNotification): number => (n.date ? Date.parse(n.date) : Number.NEGATIVE_INFINITY);
  return out.map((n, i) => ({ n, i })).sort((a, b) => time(b.n) - time(a.n) || a.i - b.i).map(({ n }) => n);
}

/** How many messages are still unread. */
export function unreadCount(items: readonly UserNotification[]): number {
  return items.filter((n) => !n.read).length;
}
