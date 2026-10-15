import { Injectable, inject, signal } from '@angular/core';
import { Authorization, DataClient, RuntimeDiagnostics, UserProvider, type DataRequest, type DataRequestOptions } from 'core';
import { DemoBackend } from './demo-backend';

/** Profiles of the demo: the permissions are those the authorization service would give in production. */
export const DEMO_PROFILES: Record<string, string[]> = {
  // Enters and looks up invoices and sees the orders: two areas.
  operator: ['showcase.components.read', 'invoices.invoice.read', 'invoices.invoice.create', 'orders.order.read'],
  // Adds packages, expense review and order approval: all four areas.
  manager: ['showcase.components.read', 'invoices.invoice.read', 'invoices.invoice.create', 'orders.order.read', 'orders.order.approve', 'orders.order.write', 'packages.package.read', 'packages.package.create', 'expenses.expense.read', 'expenses.expense.review'],
  administrator: [
    'showcase.components.read', 'invoices.invoice.read', 'invoices.invoice.create', 'orders.order.read', 'orders.order.approve', 'orders.order.write', 'orders.iban.read', 'orders.iban.write',
    'packages.package.read', 'packages.package.create', 'expenses.expense.read', 'expenses.expense.review',
  ],
};

/** Fake authorization, based on signals: changing profile redraws the screen. */
@Injectable({ providedIn: 'root' })
export class DemoSession extends Authorization implements UserProvider {
  readonly username = signal('operator');
  /** False after logging out: no permission until signing in again. */
  readonly loggedIn = signal(true);

  logout(): void {
    this.loggedIn.set(false);
  }

  login(): void {
    this.loggedIn.set(true);
  }

  override can(permission: string): boolean {
    return this.loggedIn() && (DEMO_PROFILES[this.username()] ?? []).includes(permission);
  }

  user(): Record<string, unknown> {
    return { username: this.username(), roles: [this.username()] };
  }
}

@Injectable({ providedIn: 'root' })
export class DemoDiagnostics extends RuntimeDiagnostics {
  readonly events = signal<{ screen: string; source: string; error: string }[]>([]);

  report(event: { screen: string; source: string; error: string }): void {
    console.warn('[lowcode]', event.screen, event.source, event.error);
    this.events.update((all) => [...all.slice(-49), event]);
  }
}

/** Speed of the network simulated in the demo: delay of every response in milliseconds. */
export const NETWORK_SPEEDS = { normal: 200, slow: 1500, verySlow: 9000 } as const;
export type NetworkSpeed = keyof typeof NETWORK_SPEEDS;
const NETWORK_KEY = 'lc.demo.network';

/**
 * Network simulated by the demo: with «slow» and «very slow» the activity indicators show (and, beyond eight seconds,
 * the «Taking longer than usual…» message). It holds for the browser tab (sessionStorage), then goes back to normal.
 */
@Injectable({ providedIn: 'root' })
export class DemoNetwork {
  readonly speed = signal<NetworkSpeed>(DemoNetwork.stored());

  set(speed: NetworkSpeed): void {
    this.speed.set(speed);
    try {
      sessionStorage.setItem(NETWORK_KEY, speed);
    } catch {
      // Session storage not available: it holds only until the page reloads.
    }
  }

  latency(): number {
    return NETWORK_SPEEDS[this.speed()];
  }

  private static stored(): NetworkSpeed {
    try {
      const value = sessionStorage.getItem(NETWORK_KEY);
      return value && value in NETWORK_SPEEDS ? (value as NetworkSpeed) : 'normal';
    } catch {
      return 'normal';
    }
  }
}

/** DataClient of the demo without services: the in-memory back end in the browser, with the delay of the simulated network. */
@Injectable({ providedIn: 'root' })
export class MockDataClient extends DataClient {
  static readonly PAGE_SIZE = DemoBackend.PAGE_SIZE;
  private readonly backend = new DemoBackend();
  private readonly network = inject(DemoNetwork);

  async request(req: DataRequest, options: DataRequestOptions = {}): Promise<unknown> {
    await new Promise((resolve) => setTimeout(resolve, this.network.latency()));
    // Like a real network: a read cancelled during the wait does not reach the back end.
    if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    return this.backend.handle(req);
  }
}
