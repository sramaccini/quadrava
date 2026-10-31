import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { UserProvider } from 'core';
import { firstValueFrom } from 'rxjs';
import { LOWCODE_REDIRECT, LOWCODE_SERVICES_CONFIG } from './config';

export type SessionState = 'unknown' | 'authenticated' | 'expired';

/** The user of the session (contracts/bff.yaml, User). */
interface BffUser {
  name?: string;
  username?: string;
  email?: string;
  roles?: string[];
}

/** Current user, read from the BFF. Tokens stay in the BFF: the browser has only the session cookie. */
@Injectable({ providedIn: 'root' })
export class HttpSession extends UserProvider {
  private readonly http = inject(HttpClient);
  private readonly config = inject(LOWCODE_SERVICES_CONFIG);
  private readonly redirect = inject(LOWCODE_REDIRECT);
  private readonly info = signal<BffUser | null>(null);

  readonly state = signal<SessionState>('unknown');

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
    return u ? { name: u.name ?? '', username: u.username ?? '', email: u.email ?? '', roles: u.roles ?? [] } : {};
  }

  /** Session missing or expired: the user is cleared and the flow restarts from the login, which then returns to this page. */
  markExpired(): void {
    if (this.state() === 'expired') return;
    this.info.set(null);
    this.state.set('expired');
    this.redirect(`${this.config.loginUrl}?return=${encodeURIComponent(globalThis.location?.href ?? '/')}`);
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
