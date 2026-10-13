import { Injectable, computed, inject, type Signal } from '@angular/core';
import { HttpAuthorization, HttpSession } from 'services';
import { DEMO_PROFILES, DemoDiagnostics, DemoSession } from '../demo/demo-ports';

/**
 * Quello che il guscio sa dell'utente: nome, permessi, entrata e uscita. Nella demo i profili si scelgono da un
 * elenco; con i servizi veri l'utente è quello della sessione del BFF e i permessi vengono dal servizio di
 * autorizzazione.
 */
export abstract class ShellSession {
  abstract readonly loggedIn: Signal<boolean>;
  abstract readonly username: Signal<string>;
  /** Profili tra cui scegliere (solo nella demo); vuoto = nessun selettore. */
  abstract readonly profiles: string[];
  abstract readonly permissionCount: Signal<number>;
  /** Segnalazioni tecniche mostrate in fondo alla pagina (solo nella demo; altrimenti vanno alla telemetria). */
  abstract readonly diagnosticsCount: Signal<number>;
  abstract selectProfile(name: string): void;
  abstract login(): void;
  abstract logout(): void;
}

@Injectable({ providedIn: 'root' })
export class DemoShellSession extends ShellSession {
  private readonly demo = inject(DemoSession);
  private readonly diagnostics = inject(DemoDiagnostics);
  readonly loggedIn = this.demo.loggedIn.asReadonly();
  readonly username = this.demo.username.asReadonly();
  readonly profiles = Object.keys(DEMO_PROFILES);
  readonly permissionCount = computed(() => (DEMO_PROFILES[this.demo.username()] ?? []).length);
  readonly diagnosticsCount = computed(() => this.diagnostics.events().length);

  selectProfile(name: string): void {
    this.demo.username.set(name);
  }

  login(): void {
    this.demo.login();
  }

  logout(): void {
    this.demo.logout();
  }
}

@Injectable({ providedIn: 'root' })
export class BffShellSession extends ShellSession {
  private readonly session = inject(HttpSession);
  private readonly authorization = inject(HttpAuthorization);
  readonly loggedIn = computed(() => this.session.state() === 'authenticated');
  readonly username = computed(() => {
    const user = this.session.user();
    return String(user['name'] || user['username'] || '');
  });
  readonly profiles: string[] = [];
  readonly permissionCount = this.authorization.count;
  readonly diagnosticsCount = computed(() => 0);

  selectProfile(): void {
    // Con i servizi veri il profilo è quello dell'utente autenticato.
  }

  login(): void {
    this.session.markExpired();
  }

  logout(): void {
    this.session.logout();
  }
}
