import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { UserProvider } from 'core';
import { firstValueFrom } from 'rxjs';
import { LOWCODE_REDIRECT, LOWCODE_SERVICES_CONFIG } from './config';

export type SessionState = 'unknown' | 'authenticated' | 'expired';

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

/** Current user, read from the BFF. Tokens stay in the BFF: the browser has only the session cookie. */
@Injectable({ providedIn: 'root' })
export class HttpSession extends UserProvider {
  private readonly http = inject(HttpClient);
  private readonly config = inject(LOWCODE_SERVICES_CONFIG);
  private readonly redirect = inject(LOWCODE_REDIRECT);
  private readonly info = signal<BffUser | null>(null);

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

  /** Session missing or expired: the user is cleared and the flow restarts from the login, which then returns to this page. */
  markExpired(): void {
    if (this.state() === 'expired') return;
    this.info.set(null);
    this.state.set('expired');
    this.redirect(`${this.config.loginUrl}?return=${encodeURIComponent(globalThis.location?.href ?? '/')}`);
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
