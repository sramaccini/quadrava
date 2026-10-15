import { Injectable, computed, inject, type Signal } from '@angular/core';
import { HttpAuthorization, HttpSession } from 'services';
import { DEMO_PROFILES, DemoDiagnostics, DemoSession } from '../demo/demo-ports';

/**
 * What the shell knows about the user: name, permissions, sign-in and logout. In the demo the profiles are chosen from a
 * list; with the real services the user is the one of the BFF session and the permissions come from the
 * authorization service.
 */
export abstract class ShellSession {
  abstract readonly loggedIn: Signal<boolean>;
  abstract readonly username: Signal<string>;
  /** Profiles to choose from (only in the demo); empty = no selector. */
  abstract readonly profiles: string[];
  abstract readonly permissionCount: Signal<number>;
  /** Technical reports shown at the bottom of the page (only in the demo; otherwise they go to telemetry). */
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
    // With the real services the profile is the one of the authenticated user.
  }

  login(): void {
    this.session.markExpired();
  }

  logout(): void {
    this.session.logout();
  }
}
