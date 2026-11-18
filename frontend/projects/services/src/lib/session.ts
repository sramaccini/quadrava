import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Confirmation, I18n, UserProvider } from 'core';
import { firstValueFrom } from 'rxjs';
import { LC_REDIRECT, LC_SERVICES_CONFIG } from './config';

/** `refused`: the BFF answered 401 again right after a login, so no other login is started (no loop). */
export type SessionState = 'unknown' | 'authenticated' | 'expired' | 'refused';

/** A 401 within this time from the start of a login does not start another one (milliseconds). */
const LOGIN_RETRY_MS = 30_000;
/** Only the time the last login started, per tab: it outlives the page, which the login replaces. */
const LOGIN_STARTED_KEY = 'lc.loginStartedAt';
/** The same for the last login asked again for a sensitive action (`max_age`). */
const RECENT_LOGIN_STARTED_KEY = 'lc.recentLoginStartedAt';
/** Problem type of a call whose session is valid but whose login is too old for it (contracts/bff.yaml). */
export const RECENT_LOGIN_REQUIRED = 'urn:problem:authz:recent-login-required';

function startedAt(key: string): number {
  try {
    return Number(globalThis.sessionStorage?.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function rememberStart(key: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, String(Date.now()));
  } catch {
    // Storage not available: the guard is lost, the login still works.
  }
}

/** A tenant the user may work on (contracts/bff.yaml, Tenant). Quadrava does not interpret it: it shows the label. */
export interface SessionTenant {
  id: string;
  label: string;
}

/** The user of the session (contracts/bff.yaml, User). */
interface BffUser {
  name?: string;
  username?: string;
  email?: string;
  roles?: string[];
  tenants?: unknown;
  currentTenant?: unknown;
}

/** Text of the request to sign in again, when the catalogue of the platform is not there. */
const RECENT_LOGIN_TEXT = 'For this action, sign in again. What you have not saved will be lost.';

/** Current user, read from the BFF. Tokens stay in the BFF: the browser has only the session cookie. */
@Injectable({ providedIn: 'root' })
export class HttpSession extends UserProvider {
  private readonly http = inject(HttpClient);
  private readonly config = inject(LC_SERVICES_CONFIG);
  private readonly redirect = inject(LC_REDIRECT);
  private readonly confirmation = inject(Confirmation, { optional: true });
  private readonly i18n = inject(I18n, { optional: true });
  private readonly info = signal<BffUser | null>(null);
  /** A login for a sensitive action is being asked: the other calls refused at the same time do not ask again. */
  private reauthenticating = false;

  readonly state = signal<SessionState>('unknown');
  /** Tenants offered to the user: only the well-formed ones; none when the BFF has no tenants. */
  readonly tenants = computed<readonly SessionTenant[]>(() => {
    const list = this.info()?.tenants;
    return Array.isArray(list) ? list.filter((t): t is SessionTenant => typeof t?.id === 'string' && typeof t?.label === 'string').map((t) => ({ id: t.id, label: t.label })) : [];
  });
  /** The tenant of the session, if it is one of those offered. */
  readonly currentTenant = computed(() => {
    const id = this.info()?.currentTenant;
    return typeof id === 'string' && this.tenants().some((t) => t.id === id) ? id : null;
  });
  /** The choice is offered only when the switch address is configured and there is more than one tenant. */
  readonly canSwitchTenant = computed(() => this.config.tenantSwitchUrl !== null && this.tenants().length > 1);

  async load(): Promise<void> {
    try {
      const user = await firstValueFrom(this.http.get<BffUser>(this.config.sessionUrl));
      this.info.set(user);
      this.state.set('authenticated');
    } catch {
      this.markExpired();
    }
  }

  user(): Record<string, unknown> {
    const u = this.info();
    return u ? { name: u.name ?? '', username: u.username ?? '', email: u.email ?? '', roles: u.roles ?? [], tenant: this.currentTenant() ?? '' } : {};
  }

  /**
   * Session missing or expired: the user is cleared and the flow restarts from the login, which then returns to this page.
   * If a login started a moment ago, the BFF refuses the session it has just created (a call that always answers 401, the
   * cookies blocked): the page stops at `refused` instead of going round in a circle with the identity provider.
   */
  markExpired(): void {
    if (this.state() === 'expired' || this.state() === 'refused') return;
    this.info.set(null);
    if (Date.now() - startedAt(LOGIN_STARTED_KEY) < LOGIN_RETRY_MS) {
      this.state.set('refused');
      return;
    }
    this.state.set('expired');
    this.login();
  }

  /** Goes to the login of the BFF, which then returns to this page. Also asked by the user, after `refused`. */
  login(): void {
    rememberStart(LOGIN_STARTED_KEY);
    this.redirect(`${this.config.loginUrl}?return=${encodeURIComponent(globalThis.location?.href ?? '/')}`);
  }

  /**
   * The session is valid but its login is too old for a sensitive action (`recent-login-required`): the user is told and,
   * if they agree, signs in again with `max_age`, so that the identity provider asks for the credentials even inside its
   * own session, and comes back to this page to do the action again. It is not an expired session: the user stays, and
   * the guard of the logins is not touched. A second request within 30 seconds of such a login asks nothing (a BFF that
   * keeps refusing would send the browser round in a circle); the call simply fails.
   */
  async reauthenticate(maxAge: number): Promise<void> {
    if (this.reauthenticating || Date.now() - startedAt(RECENT_LOGIN_STARTED_KEY) < LOGIN_RETRY_MS) return;
    this.reauthenticating = true;
    try {
      const message = this.i18n?.t('lc.session.recentLogin', {}, RECENT_LOGIN_TEXT) ?? RECENT_LOGIN_TEXT;
      if (this.confirmation && !(await this.confirmation.confirm(message))) return;
      rememberStart(RECENT_LOGIN_STARTED_KEY);
      const age = Number.isInteger(maxAge) && maxAge >= 0 ? maxAge : 0;
      this.redirect(`${this.config.loginUrl}?return=${encodeURIComponent(globalThis.location?.href ?? '/')}&max_age=${age}`);
    } finally {
      this.reauthenticating = false;
    }
  }

  /**
   * Moves the session to another tenant: a POST to the BFF (never a GET, so a link from another site cannot do it), then
   * the page starts again, because permissions, navigation and screens depend on the tenant. False if the switch is not
   * offered, the tenant is not one of those listed, or the BFF refuses it.
   */
  async switchTenant(id: string): Promise<boolean> {
    const url = this.config.tenantSwitchUrl;
    if (!this.canSwitchTenant() || url === null || id === this.currentTenant() || !this.tenants().some((t) => t.id === id)) return false;
    try {
      await firstValueFrom(this.http.post(url, { tenant: id }));
    } catch {
      // Refused, or session expired (the interceptor then goes to the login).
      return false;
    }
    this.redirect((globalThis.location?.href ?? '/').split('#')[0]);
    return true;
  }

  /**
   * Logout: a POST to the BFF (HttpClient adds the CSRF token from the cookie), which closes the session and answers with
   * the end-session address of the identity provider; the page goes there, and from there back to the login.
   */
  async logout(): Promise<void> {
    try {
      const reply = await firstValueFrom(this.http.post<{ redirect?: string }>(this.config.logoutUrl, null, { headers: { Accept: 'application/json' } }));
      this.redirect(typeof reply?.redirect === 'string' ? reply.redirect : '/');
    } catch {
      // Session already closed: restart from the login.
      this.markExpired();
    }
  }
}
