import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { UserProvider } from 'core';
import { firstValueFrom } from 'rxjs';
import { LOWCODE_REDIRECT, LOWCODE_SERVICES_CONFIG } from './config';

export type SessionState = 'unknown' | 'authenticated' | 'expired';

interface BffUser {
  name?: string;
  username?: string;
  roles?: string[];
}

/** Utente corrente, letto dal BFF. I token restano nel BFF: il browser ha solo il cookie di sessione. */
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
    return u ? { name: u.name ?? '', username: u.username ?? '', roles: u.roles ?? [] } : {};
  }

  /** Sessione assente o scaduta: si svuota l'utente e si riparte dal login, che poi riporta a questa pagina. */
  markExpired(): void {
    if (this.state() === 'expired') return;
    this.info.set(null);
    this.state.set('expired');
    this.redirect(`${this.config.loginUrl}?return=${encodeURIComponent(globalThis.location?.href ?? '/')}`);
  }

  /**
   * Uscita: un POST al BFF (HttpClient vi aggiunge il token CSRF del cookie), che chiude la sessione e risponde con
   * l'indirizzo di fine sessione del provider di identità; la pagina ci va, e da lì si torna al login.
   */
  async logout(): Promise<void> {
    try {
      const reply = await firstValueFrom(this.http.post<{ redirect?: string }>(this.config.logoutUrl, null, { headers: { Accept: 'application/json' } }));
      this.redirect(typeof reply?.redirect === 'string' ? reply.redirect : '/');
    } catch {
      // Sessione già chiusa: si riparte dal login.
      this.markExpired();
    }
  }
}
