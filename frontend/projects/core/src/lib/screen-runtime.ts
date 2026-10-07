import { effect, Injector, signal, computed, untracked, type EffectRef } from '@angular/core';
import { ExpressionEngine, parseTemplate } from 'expressions';
import type { NodeDefinition, ScreenDefinition } from 'schema';
import { Authorization, DataClient, Notifier, RuntimeDiagnostics, ScreenNavigator, UserProvider, type DataRequest } from './ports';
import type { CallResult, DataSourceState, Scope } from './types';

export interface RuntimeDeps {
  authorization: Authorization;
  userProvider: UserProvider;
  data: DataClient;
  navigator: ScreenNavigator;
  notifier: Notifier;
  diagnostics?: RuntimeDiagnostics | null;
}

type Built = { ok: true; request: DataRequest } | { ok: false; error: string };

const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const IDLE: DataSourceState = { status: 'idle', data: null };

/**
 * Stato e comportamento di UNA schermata in esecuzione: stato (`state`), data source, valutazione delle espressioni.
 * Non conosce Angular a livello di template: i componenti lo ricevono come input.
 */
export class ScreenRuntime {
  readonly engine: ExpressionEngine;
  /** Stato della schermata: filtri, pagina, selezione. Si legge nelle espressioni come `state`. */
  readonly state = signal<Record<string, unknown>>({ page: 0 });
  readonly dataSources = signal<Record<string, DataSourceState>>({});
  /** Vero se l'utente ha il permesso richiesto dalla schermata (`requires`). */
  readonly allowed = computed(() => !this.definition.requires || this.deps.authorization.can(this.definition.requires));

  private readonly effects: EffectRef[] = [];
  private readonly sequence = new Map<string, number>();

  constructor(
    readonly definition: ScreenDefinition,
    private readonly deps: RuntimeDeps,
    injector: Injector,
    readonly params: Record<string, unknown> = {},
  ) {
    this.engine = new ExpressionEngine(
      { can: (permission) => deps.authorization.can(permission) },
      { onError: (info) => this.report(info.source, info.error) },
    );
    // I filtri dichiarati esistono nello stato fin dall'inizio (nulli): i data source che li usano non vanno in errore al primo caricamento.
    this.seedFilters(definition.components);
    // Ogni data source GET si carica da solo e si ricarica quando cambiano i valori da cui dipende (filtri, pagina, permessi).
    for (const [name, source] of Object.entries(definition.dataSources ?? {})) {
      if (source.method !== 'GET') continue;
      this.effects.push(
        effect(
          () => {
            if (!this.allowed()) return;
            const built = this.build(name, {});
            untracked(() => {
              if (built.ok) void this.run(name, built.request);
              else this.setSource(name, { status: 'error', data: null, error: built.error });
            });
          },
          { injector },
        ),
      );
    }
  }

  private seedFilters(nodes: readonly NodeDefinition[]): void {
    for (const node of nodes) {
      if (node.type === 'filterBar') {
        for (const field of node.fields) {
          const path = `${node.bind}.${field.name}`;
          if (this.getState(path) === undefined) this.setState(path, null);
        }
      } else if (node.type === 'section') {
        this.seedFilters(node.components);
      }
    }
  }

  destroy(): void {
    for (const e of this.effects) e.destroy();
    this.effects.length = 0;
  }

  /** Contesto di valutazione: utente, stato, parametri e variabili del punto corrente. */
  context(scope: Scope = {}): Scope {
    return { user: this.deps.userProvider.user(), state: this.state(), params: this.params, ...scope };
  }

  isVisible(node: { visibleIf?: string; hiddenIf?: string }, scope: Scope = {}): boolean {
    const ctx = this.context(scope);
    return (
      this.engine.evaluateCondition(node.visibleIf, ctx, { whenMissing: true }) &&
      // hiddenIf in errore => nascosto (fail-closed)
      !this.engine.evaluateCondition(node.hiddenIf, ctx, { whenMissing: false, fallback: true })
    );
  }

  isEnabled(node: { enabledIf?: string }, scope: Scope = {}): boolean {
    return this.engine.evaluateCondition(node.enabledIf, this.context(scope), { whenMissing: true });
  }

  /** readOnlyIf in errore => sola lettura (fail-closed). */
  isReadOnly(node: { readOnlyIf?: string }, scope: Scope = {}): boolean {
    return this.engine.evaluateCondition(node.readOnlyIf, this.context(scope), { whenMissing: false, fallback: true });
  }

  /** Valuta un testo con `{{ }}`; in caso di errore restituisce il testo originale. */
  text(template: string | undefined, scope: Scope = {}): string {
    if (template === undefined) return '';
    const result = this.engine.interpolate(template, this.context(scope));
    if (!result.ok) return template;
    return result.value === null || result.value === undefined ? '' : String(result.value);
  }

  /** Risolve ricorsivamente le espressioni nelle stringhe di un valore (args, params). Le espressioni in errore diventano `undefined`. */
  resolveValue(value: unknown, scope: Scope = {}): unknown {
    const ctx = this.context(scope);
    return this.resolveIn(value, ctx);
  }

  setState(path: string, value: unknown): void {
    const keys = path.replace(/^state\./, '').split('.');
    if (keys.some((k) => !k || FORBIDDEN_PATH_SEGMENTS.has(k))) {
      this.report(`set ${path}`, 'percorso di stato non valido');
      return;
    }
    this.state.update((current) => assign(current, keys, value));
  }

  getState(path: string): unknown {
    let current: unknown = this.state();
    for (const key of path.replace(/^state\./, '').split('.')) {
      if (current === null || typeof current !== 'object' || FORBIDDEN_PATH_SEGMENTS.has(key)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  /** Stato corrente di un data source. */
  source(name: string): DataSourceState {
    return this.dataSources()[name] ?? IDLE;
  }

  /** Esegue un data source con gli argomenti dati (variabili disponibili a `url` e `params`). */
  async execute(name: string, args: Record<string, unknown> = {}, scope: Scope = {}): Promise<CallResult> {
    const built = this.build(name, args, scope);
    if (!built.ok) {
      this.report(`call ${name}`, built.error);
      return { ok: false, error: built.error };
    }
    return this.run(name, built.request);
  }

  /** Ricarica un data source GET. */
  async refresh(name: string): Promise<CallResult> {
    const source = this.definition.dataSources?.[name];
    if (source?.method !== 'GET') {
      const error = `refresh non applicabile a ${name}`;
      this.report(`refresh ${name}`, error);
      return { ok: false, error };
    }
    return this.execute(name);
  }

  navigate(screen: string, params: Record<string, unknown>): void {
    this.deps.navigator.navigate(screen, params);
  }

  toast(message: string, kind: 'info' | 'error' = 'info'): void {
    this.deps.notifier.toast(message, kind);
  }

  /**
   * Segnala un problema tecnico. L'invio è differito: gli errori delle espressioni nascono durante il rendering
   * dei template, dove scrivere in un signal è vietato, e le implementazioni della porta potrebbero farlo.
   */
  report(source: string, error: string): void {
    const diagnostics = this.deps.diagnostics;
    if (!diagnostics) return;
    const event = { screen: this.definition.screen, source, error };
    queueMicrotask(() => diagnostics.report(event));
  }

  private async run(name: string, request: DataRequest): Promise<CallResult> {
    const seq = (this.sequence.get(name) ?? 0) + 1;
    this.sequence.set(name, seq);
    const previous = this.source(name);
    this.setSource(name, { status: 'loading', data: previous.data });
    try {
      const data = await this.deps.data.request(request);
      // Una risposta più vecchia non deve sovrascrivere una più recente.
      if (this.sequence.get(name) === seq) this.setSource(name, { status: 'ready', data });
      return { ok: true, data };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.report(`data source ${name}`, error);
      if (this.sequence.get(name) === seq) this.setSource(name, { status: 'error', data: null, error: 'Caricamento non riuscito' });
      return { ok: false, error };
    }
  }

  private setSource(name: string, state: DataSourceState): void {
    this.dataSources.update((all) => ({ ...all, [name]: state }));
  }

  private build(name: string, args: Record<string, unknown>, scope: Scope = {}): Built {
    const source = this.definition.dataSources?.[name];
    if (!source) return { ok: false, error: `data source sconosciuto: ${name}` };
    // Gli argomenti hanno la precedenza sulle variabili del punto da cui parte la chiamata (row, form).
    const ctx = this.context({ ...scope, ...args });
    const url = this.resolveUrl(source.url, ctx);
    if (!url.ok) return url;
    const resolved = (this.resolveIn(source.params ?? {}, ctx) ?? {}) as Record<string, unknown>;
    const params = Object.fromEntries(Object.entries(resolved).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if (source.method === 'GET' || source.method === 'DELETE') {
      return { ok: true, request: { method: source.method, url: url.value, query: params } };
    }
    const body = source.body === undefined ? params : this.resolveIn(source.body, ctx);
    const request: DataRequest = { method: source.method, url: url.value, body: (body ?? {}) as Record<string, unknown> };
    return { ok: true, request };
  }

  /** Sostituisce le espressioni dell'URL con valori codificati e accetta solo percorsi relativi alla stessa origine. */
  private resolveUrl(template: string, ctx: Scope): { ok: true; value: string } | { ok: false; error: string } {
    let url = '';
    try {
      for (const segment of parseTemplate(template)) {
        if (segment.kind === 'text') {
          url += segment.text;
        } else {
          const result = this.engine.evaluate(segment.source, ctx);
          if (!result.ok || result.value === null || result.value === undefined) {
            return { ok: false, error: `valore mancante nell'URL: ${segment.source}` };
          }
          url += encodeURIComponent(String(result.value));
        }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!/^\/(?!\/)/.test(url) || url.includes('\\') || /(^|\/)\.\.(\/|$)/.test(url)) {
      return { ok: false, error: 'URL non ammesso: deve essere un percorso relativo' };
    }
    return { ok: true, value: url };
  }

  private resolveIn(value: unknown, ctx: Scope): unknown {
    if (typeof value === 'string') {
      if (!value.includes('{{')) return value;
      const result = this.engine.interpolate(value, ctx);
      return result.ok ? result.value : undefined;
    }
    if (Array.isArray(value)) return value.map((v) => this.resolveIn(v, ctx));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.resolveIn(v, ctx)]));
    }
    return value;
  }
}

function assign(target: Record<string, unknown>, keys: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = keys;
  if (rest.length === 0) return { ...target, [head]: value };
  const child = target[head];
  const base = child !== null && typeof child === 'object' && !Array.isArray(child) ? (child as Record<string, unknown>) : {};
  return { ...target, [head]: assign(base, rest, value) };
}
