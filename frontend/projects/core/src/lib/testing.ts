import { Injector } from '@angular/core';
import type { ScreenDefinition } from 'schema';
import { Authorization, Confirmation, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider, type DataRequest } from './ports';
import { I18n } from './i18n';
import { ScreenRuntime } from './screen-runtime';

/** Doppioni di test per le porte: registrano le chiamate e permettono di scegliere le risposte. */
export class Fakes {
  permissions = new Set<string>();
  requests: DataRequest[] = [];
  toasts: { message: string; kind?: string }[] = [];
  navigations: { screen: string; params: Record<string, unknown> }[] = [];
  reports: { screen: string; source: string; error: string }[] = [];
  /** Messaggi di conferma richiesti e risposte da dare in ordine (se finiscono, l'utente rinuncia). */
  confirmations: string[] = [];
  confirmAnswers: boolean[] = [];
  i18n = new I18n();
  respond: (request: DataRequest) => unknown = () => ({ items: [], total: 0 });

  readonly deps = {
    authorization: { can: (p: string) => this.permissions.has(p) } as Authorization,
    userProvider: { user: () => ({ username: 'test' }) } as UserProvider,
    data: { request: async (r: DataRequest) => { this.requests.push(r); return this.respond(r); } } as DataClient,
    navigator: { navigate: (screen: string, params: Record<string, unknown>) => this.navigations.push({ screen, params }) } as ScreenNavigator,
    notifier: { toast: (message: string, kind?: string) => this.toasts.push({ message, kind }) } as Notifier,
    confirmation: { confirm: async (message: string) => { this.confirmations.push(message); return this.confirmAnswers.shift() ?? false; } } as Confirmation,
    i18n: this.i18n,
    diagnostics: { report: (e: { screen: string; source: string; error: string }) => this.reports.push(e) } as RuntimeDiagnostics,
  };

  runtime(definition: ScreenDefinition, injector: Injector, params: Record<string, unknown> = {}): ScreenRuntime {
    return new ScreenRuntime(definition, this.deps, injector, params);
  }
}
