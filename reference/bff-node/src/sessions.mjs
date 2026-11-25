// Sessions and logins in progress, in the memory of the process: lost at restart and not shared between instances.
// A real deployment keeps them in a shared store (the reference BFF uses Redis).
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** A random identifier that cannot be guessed (256 bits). */
export const randomId = () => randomBytes(32).toString('base64url');

/**
 * Do two secrets match? In constant time.
 * @param {string | undefined} a
 * @param {string | undefined} b
 */
export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * @typedef {object} Tokens
 * @property {string} accessToken
 * @property {string | undefined} refreshToken
 * @property {string | undefined} idToken
 * @property {number} expiresAt  milliseconds
 *
 * @typedef {object} Session
 * @property {string} id
 * @property {string} csrf                 the value of the XSRF-TOKEN cookie of this session
 * @property {number} createdAt
 * @property {number} lastSeen
 * @property {{ name?: string, username?: string, email?: string, roles: string[] }} user
 * @property {Set<string>} permissions
 * @property {string} permissionsVersion
 * @property {Tokens} tokens
 * @property {Promise<boolean> | null} refreshing  the renewal in progress, shared by concurrent calls
 *
 * @typedef {object} PendingLogin
 * @property {string} browser    the value of the login cookie of the browser that started it
 * @property {string} verifier   PKCE code verifier
 * @property {string} nonce
 * @property {string} returnTo
 * @property {number | undefined} maxAge
 * @property {string} redirectUri
 * @property {number} expiresAt
 */

const MAX_PENDING = 10_000;
const PENDING_SECONDS = 600;

export class SessionStore {
  /** @type {Map<string, Session>} */
  #sessions = new Map();
  /** @type {Map<string, PendingLogin>} by state */
  #pending = new Map();

  /**
   * @param {{ idleSeconds: number, maxSeconds: number, now?: () => number }} options
   */
  constructor({ idleSeconds, maxSeconds, now = Date.now }) {
    this.idle = idleSeconds * 1000;
    this.max = maxSeconds * 1000;
    this.now = now;
  }

  /**
   * A new session (a new identifier at every login: no session fixation).
   * @param {Omit<Session, 'id' | 'csrf' | 'createdAt' | 'lastSeen' | 'refreshing'>} data
   * @returns {Session}
   */
  create(data) {
    const now = this.now();
    const session = { ...data, id: randomId(), csrf: randomId(), createdAt: now, lastSeen: now, refreshing: null };
    this.#sessions.set(session.id, session);
    return session;
  }

  /**
   * The live session with this identifier, or null; a call that finds it counts as activity.
   * @param {string | undefined} id
   * @returns {Session | null}
   */
  get(id) {
    const session = id ? this.#sessions.get(id) : undefined;
    if (!session) return null;
    const now = this.now();
    if (now - session.lastSeen > this.idle || now - session.createdAt > this.max) {
      this.#sessions.delete(session.id);
      return null;
    }
    session.lastSeen = now;
    return session;
  }

  /** @param {string} id */
  delete(id) {
    this.#sessions.delete(id);
  }

  /**
   * Remembers a login in progress, by its `state`, for ten minutes.
   * @param {string} state
   * @param {Omit<PendingLogin, 'expiresAt'>} login
   */
  startLogin(state, login) {
    // Bounded: a flood of /bff/login drops the oldest logins, not the memory of the process.
    if (this.#pending.size >= MAX_PENDING) this.#pending.delete(this.#pending.keys().next().value);
    this.#pending.set(state, { ...login, expiresAt: this.now() + PENDING_SECONDS * 1000 });
  }

  /**
   * The login started with this `state` by this browser, once only; null if unknown, expired or of another browser.
   * @param {string | undefined} state
   * @param {string | undefined} browser
   * @returns {PendingLogin | null}
   */
  finishLogin(state, browser) {
    const login = state ? this.#pending.get(state) : undefined;
    if (!login) return null;
    this.#pending.delete(state);
    if (login.expiresAt < this.now() || !sameSecret(login.browser, browser)) return null;
    return login;
  }

  /** Drops the expired sessions and logins (called on a timer). */
  sweep() {
    const now = this.now();
    for (const [id, s] of this.#sessions) if (now - s.lastSeen > this.idle || now - s.createdAt > this.max) this.#sessions.delete(id);
    for (const [state, l] of this.#pending) if (l.expiresAt < now) this.#pending.delete(state);
  }

  get size() {
    return this.#sessions.size;
  }
}
