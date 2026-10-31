import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { HttpAuthorization, HttpSession, type SessionTenant } from 'services';
import { DEMO_PROFILES, DEMO_TENANTS, DemoDiagnostics, DemoSession } from '../demo/demo-ports';

/**
 * What the shell knows about the user: name, permissions, sign-in and logout. In the demo the profiles are chosen from a
 * list; with the real services the user is the one of the BFF session and the permissions come from the
 * authorization service. A user who works for several tenants can switch between them in the user menu.
 */
export abstract class ShellSession {
  abstract readonly loggedIn: Signal<boolean>;
  /** The BFF refused the session right after a login: the page says so instead of signing in again. */
  abstract readonly loginRefused: Signal<boolean>;
  abstract readonly username: Signal<string>;
  /** Profiles to choose from (only in the demo); empty = no selector. */
  abstract readonly profiles: string[];
  abstract readonly permissionCount: Signal<number>;
  /** Technical reports shown at the bottom of the page (only in the demo; otherwise they go to telemetry). */
  abstract readonly diagnosticsCount: Signal<number>;
  /** Tenants to choose from (contracts/bff.yaml, optional part); fewer than two = no choice. */
  abstract readonly tenants: Signal<readonly SessionTenant[]>;
  abstract readonly currentTenant: Signal<string | null>;
  abstract selectProfile(name: string): void;
  /** Switches tenant; false if it was refused (the page stays where it is). */
  abstract switchTenant(id: string): Promise<boolean>;
  abstract login(): void;
  abstract logout(): void;
}

@Injectable({ providedIn: 'root' })
export class DemoShellSession extends ShellSession {
  private readonly demo = inject(DemoSession);
  private readonly diagnostics = inject(DemoDiagnostics);
  readonly loggedIn = this.demo.loggedIn.asReadonly();
  readonly loginRefused = signal(false).asReadonly();
  readonly username = this.demo.username.asReadonly();
  readonly profiles = Object.keys(DEMO_PROFILES);
  readonly permissionCount = computed(() => (DEMO_PROFILES[this.demo.username()] ?? []).length);
  readonly diagnosticsCount = computed(() => this.diagnostics.events().length);
  readonly tenants = computed(() => DEMO_TENANTS[this.demo.username()] ?? []);
  readonly currentTenant = computed(() => this.demo.tenant() || null);

  selectProfile(name: string): void {
    this.demo.username.set(name);
  }

  /** In the demo nothing depends on the tenant but `user.tenant`: no reload. */
  async switchTenant(id: string): Promise<boolean> {
    this.demo.chosenTenant.set(id);
    return true;
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
  readonly loginRefused = computed(() => this.session.state() === 'refused');
  readonly username = computed(() => {
    const user = this.session.user();
    return String(user['name'] || user['username'] || '');
  });
  readonly profiles: string[] = [];
  readonly permissionCount = this.authorization.count;
  readonly diagnosticsCount = computed(() => 0);
  readonly tenants = computed(() => (this.session.canSwitchTenant() ? this.session.tenants() : []));
  readonly currentTenant = this.session.currentTenant;

  selectProfile(): void {
    // With the real services the profile is the one of the authenticated user.
  }

  switchTenant(id: string): Promise<boolean> {
    return this.session.switchTenant(id);
  }

  login(): void {
    this.session.login();
  }

  logout(): void {
    this.session.logout();
  }
}
