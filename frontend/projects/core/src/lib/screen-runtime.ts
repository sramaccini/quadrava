import { effect, Injector, signal, computed, untracked, type EffectRef } from '@angular/core';
import { ExpressionEngine, parseTemplate } from 'expressions';
import { inlineDataSource, type DialogStep, type FieldDefinition, type InputNode, type NodeDefinition, type ScreenDefinition, type Step } from 'schema';
import {
  Authorization,
  Confirmation,
  DataClient,
  FormDialog,
  LiveUpdates,
  Notifier,
  RuntimeDiagnostics,
  type DiagnosticSeverity,
  RuntimeTracer,
  ScreenNavigator,
  UserProvider,
  type DataRequest,
  type DataRequestOptions,
  type SpanAttributes,
  type SpanContext,
  type TraceSpan,
} from './ports';
import type { I18n } from './i18n';
import type { CallResult, DataSourceState, Scope } from './types';
import { fieldErrorsOf, pointerSegments, type FieldError } from './field-errors';
import { remoteSources } from './validation';
import { ValidatorRegistry } from './validators';

/** A standalone field on the screen, as its validation group knows it. */
export interface GroupField {
  /** Its definition (name, label, type). */
  readonly field: FieldDefinition;
  /** Where its value is in the state. */
  readonly path: string;
  /** Shows an error of a service on the field (until its value changes). */
  showFieldError(error: FieldError): void;
}

export interface RuntimeDeps {
  authorization: Authorization;
  userProvider: UserProvider;
  data: DataClient;
  navigator: ScreenNavigator;
  notifier: Notifier;
  diagnostics?: RuntimeDiagnostics | null;
  /** If missing, nothing is traced. */
  tracer?: RuntimeTracer | null;
  /** If missing, `confirm` steps do not go on (fail-closed). */
  confirmation?: Confirmation | null;
  /** If missing, `dialog` steps do not go on (fail-closed). */
  formDialog?: FormDialog | null;
  /** Language and translations. If missing, the runtime's own texts use their English fallbacks and `t()` uses the fallback. */
  i18n?: I18n | null;
  /** Validators of the fields and of `isValid()`. If missing, the built-in ones. */
  validators?: ValidatorRegistry | null;
  /** Values of the settings of the application, `settings` in the expressions. If missing, none. */
  settings?: (() => Readonly<Record<string, string>>) | null;
  /** Event streams of the data sources with `live`. If missing, they are read only when the screen opens and on refresh. */
  live?: LiveUpdates | null;
}

type Built = { ok: true; request: DataRequest } | { ok: false; error: string };

const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);
const IDLE: DataSourceState = { status: 'idle', data: null };
/** An expression that is only a setting of the application (`settings.ordersApi`). */
const SETTING_ALONE = /^\s*settings\.[A-Za-z][A-Za-z0-9_]*\s*$/;
/** Wait after an event of a live data source: a burst of events becomes a single read. */
const LIVE_DELAY_MS = 200;
/** Characters of a path (no query, fragment, backslash or spaces). */
const PATH_TEXT = /^[A-Za-z0-9\-._~/%]*$/;

/**
 * State and behaviour of ONE running screen: state (`state`), data sources, evaluation of expressions.
 * It knows nothing of Angular templates: components receive it as an input.
 */
export class ScreenRuntime {
  readonly engine: ExpressionEngine;
  /** Validators of the fields (built-in and of the application), also behind `isValid()` in expressions. */
  readonly validatorRegistry: ValidatorRegistry;
  /** State of the screen: filters, page, selection. Read in expressions as `state`. */
  readonly state = signal<Record<string, unknown>>({ page: 0 });
  readonly dataSources = signal<Record<string, DataSourceState>>({});
  /** How many times each data source was asked to reload (refresh step): components that query it themselves follow it. */
  readonly refreshCount = signal<Record<string, number>>({});
  /** True if the user has the permission required by the screen (`requires`). */
  /**
   * Last answers of the GET data sources of the screen, by name: `data` in expressions (ADR-23). A data source not yet
   * answered or failed is missing (an expression that reads it fails closed); while reloading it keeps the previous one.
   */
  readonly data = computed<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const [name, source] of Object.entries(this.dataSources())) {
      if (source.data !== null && source.data !== undefined && inlineDataSource(this.definition.dataSources?.[name])?.method === 'GET') out[name] = source.data;
    }
    return out;
  });
  readonly allowed = computed(() => !this.definition.requires || this.deps.authorization.can(this.definition.requires));

  private readonly effects: EffectRef[] = [];
  private readonly sequence = new Map<string, number>();
  /** Reads in progress of every data source, to cancel when a newer one starts. */
  private readonly inflight = new Map<string, AbortController>();
  /** Identical service reads (`query`) in progress: whoever arrives later waits for the same response. */
  private readonly sharedQueries = new Map<string, Promise<unknown>>();
  private readonly missingKeys = new Set<string>();
  /** Standalone fields by validation group: rules across fields see the values of the group. */
  private readonly groups = signal<ReadonlyMap<string, readonly GroupField[]>>(new Map());
  /** Checks of the standalone fields, by validation group. */
  private readonly validators = new Map<string, Set<() => boolean>>();
  /** Last request of the automatic load of every GET data source (so as not to repeat it if it does not change). */
  private readonly lastAutoRequest = new Map<string, string>();
  /** Span of the opening: it closes when every GET data source has finished its first read. */
  private readonly openSpan: TraceSpan | null;
  /** GET data sources that have not finished their first read yet, and whether any of them failed. */
  private readonly pendingFirstLoad = new Set<string>();
  private firstLoadFailed = false;
  /** Reads already scheduled by an event of a live data source. */
  private readonly liveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The action (`lc.action` of its span) of every span opened here: the calls that start from it name it in their baggage. */
  private readonly actions = new WeakMap<SpanContext, string>();
  /** Current values of the fields marked `sensitive` (and of the passwords), by field: never in the technical reports. */
  private readonly sensitiveValues = new Map<object, string[]>();

  constructor(
    readonly definition: ScreenDefinition,
    private readonly deps: RuntimeDeps,
    injector: Injector,
    readonly params: Record<string, unknown> = {},
  ) {
    const validators = (this.validatorRegistry = deps.validators ?? new ValidatorRegistry());
    this.engine = new ExpressionEngine(
      { can: (permission) => deps.authorization.can(permission) },
      {
        // A data source that has not answered yet is not a fault of the expression that reads it (ADR-23).
        onError: (info) => {
          if (!this.awaitingData(info.error)) this.report(info.source, info.error);
        },
        validate: (name, value, params) => validators.check(name, value, params),
        i18n: deps.i18n
          ? {
              locale: () => deps.i18n!.intlLocale(),
              translate: (key, fallback, params) => {
                const result = deps.i18n!.lookup(key, fallback, params);
                if (!result.found) this.reportMissingKey(key);
                return result.text;
              },
            }
          : undefined,
      },
    );
    // The declared filters exist in the state from the start (null): the data sources that use them do not fail on the first load.
    this.seedFilters(definition.components);
    // A reference not resolved (`resolveDataSources`) is not a data source: fail-closed.
    // The data sources of remote rules are asked only with a value to check.
    const checks = remoteSources(definition.components);
    const reads = Object.entries(definition.dataSources ?? {}).filter(([name, source]) => inlineDataSource(source)?.method === 'GET' && !checks.has(name));
    for (const [name] of reads) this.pendingFirstLoad.add(name);
    this.openSpan = this.startSpan('screen.open', { 'lc.datasources': reads.length });
    if (reads.length === 0) this.openSpan?.end(true);
    // Every GET data source loads by itself and reloads when the resolved request changes (URL and parameters: filters,
    // page, sorting…). A state change that does not touch the request (a selection, a step, a chosen node) does not
    // cause a new call: to reload anyway there is the refresh step.
    for (const [name] of reads) {
      this.effects.push(
        effect(
          () => {
            if (!this.allowed()) {
              this.lastAutoRequest.delete(name);
              this.firstLoadDone(name, true);
              return;
            }
            const built = this.build(name, {});
            untracked(() => {
              const key = built.ok ? JSON.stringify(built.request) : `error: ${built.error}`;
              if (this.lastAutoRequest.get(name) === key) return;
              this.lastAutoRequest.set(name, key);
              const first = this.pendingFirstLoad.has(name);
              if (built.ok) {
                void this.run(name, built.request, first ? this.openSpan?.context : undefined).then((result) => {
                  // A read cancelled because outdated leaves the outcome to the one that replaced it.
                  if (first && (result.ok || result.error !== 'cancelled')) this.firstLoadDone(name, result.ok);
                });
              } else {
                this.setSource(name, { status: 'error', data: null, error: built.error });
                this.firstLoadDone(name, false);
              }
            });
          },
          { injector },
        ),
      );
    }
    // Live data sources: while the screen is allowed, an event of their stream reads them again (events carry no data).
    for (const [name, entry] of reads) {
      const live = inlineDataSource(entry)?.live;
      if (!live || !deps.live) continue;
      if (!live.url.startsWith('/') || live.url.startsWith('//') || !PATH_TEXT.test(live.url)) {
        this.report(`data source ${name}`, `event stream not on the same origin: ${live.url}`);
        continue;
      }
      this.effects.push(
        effect(
          (onCleanup) => {
            if (!this.allowed()) return;
            onCleanup(untracked(() => deps.live!.listen(live.url, live.events ?? [], () => this.liveChanged(name))));
          },
          { injector },
        ),
      );
    }
  }

  /** An event of a live data source: one read for a burst of events. */
  private liveChanged(name: string): void {
    if (this.liveTimers.has(name)) return;
    this.liveTimers.set(
      name,
      setTimeout(() => {
        this.liveTimers.delete(name);
        void this.refresh(name);
      }, LIVE_DELAY_MS),
    );
  }

  /** Declared filters (null), default sorting and selections (empty) exist in the state before the first load. */
  private seedFilters(nodes: readonly NodeDefinition[]): void {
    for (const node of nodes) {
      if (node.type === 'filterBar') {
        for (const field of node.fields) {
          const path = `${node.bind}.${field.name}`;
          if (this.getState(path) === undefined) this.setState(path, null);
        }
      } else if (node.type === 'table') {
        const sort = node.sort;
        if (sort?.bind && this.getState(sort.bind) === undefined) this.setState(sort.bind, sort.default ? { ...sort.default } : null);
        const selection = node.selection;
        if (selection && this.getState(selection.bind) === undefined) this.setState(selection.bind, []);
      } else if (node.type === 'section' || node.type === 'box' || node.type === 'grid' || node.type === 'border') {
        this.seedFilters(node.components);
      } else if (node.type === 'tabs') {
        for (const tab of node.tabs) this.seedFilters(tab.components);
      } else if (node.type === 'calendar') {
        // The calendar starts from the current month.
        if (node.bind && this.getState(node.bind) === undefined) {
          const now = new Date();
          this.setState(node.bind, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        }
      } else if (node.type === 'input') {
        const path = inputPath(node);
        // The initial value can contain {{ }} (for example a translated text).
        if (this.getState(path) === undefined) this.setState(path, this.resolveValue(initialInputValue(node)));
      } else if (node.type === 'tree') {
        if (node.bind && this.getState(node.bind) === undefined) this.setState(node.bind, null);
      } else if (node.type === 'wizard') {
        if (node.bind && this.getState(node.bind) === undefined) this.setState(node.bind, 0);
        for (const step of node.steps) this.seedFilters(step.components);
      }
    }
  }

  destroy(): void {
    this.openSpan?.end(!this.firstLoadFailed, { 'lc.interrupted': this.pendingFirstLoad.size > 0 });
    for (const e of this.effects) e.destroy();
    this.effects.length = 0;
    this.sensitiveValues.clear();
    for (const timer of this.liveTimers.values()) clearTimeout(timer);
    this.liveTimers.clear();
    // Once the screen is left, the reads in progress are no longer needed.
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
  }

  /**
   * Opens a span with the screen name among its attributes; null if there is no trace receiver. A trace that fails
   * does not disturb the screen.
   */
  startSpan(name: string, attributes: SpanAttributes = {}, parent?: SpanContext): TraceSpan | null {
    const tracer = this.deps.tracer;
    if (!tracer) return null;
    try {
      const span = tracer.start(name, { 'lc.screen': this.definition.screen, ...attributes }, parent);
      const action = attributes['lc.action'];
      if (typeof action === 'string') this.actions.set(span.context, action);
      return span;
    } catch {
      return null;
    }
  }

  /** Context of a call for the audit of the services: the screen and, if it starts from the span of an action, the action. */
  private baggage(trace?: SpanContext): Record<string, string> {
    const action = trace && this.actions.get(trace);
    return action ? { 'lc.screen': this.definition.screen, 'lc.action': action } : { 'lc.screen': this.definition.screen };
  }

  private firstLoadDone(name: string, ok: boolean): void {
    if (!this.pendingFirstLoad.delete(name)) return;
    if (!ok) this.firstLoadFailed = true;
    if (this.pendingFirstLoad.size === 0) this.openSpan?.end(!this.firstLoadFailed);
  }

  /** The error of an expression is only `data.<name>` of a GET data source that has not answered yet (or has failed, reported on its own). */
  private awaitingData(error: string): boolean {
    const name = /^No such key: ([A-Za-z][A-Za-z0-9_]*)$/.exec(error)?.[1];
    return !!name && inlineDataSource(this.definition.dataSources?.[name])?.method === 'GET' && !(name in untracked(() => this.data()));
  }

  /** Evaluation context: user, state, parameters, settings, data of the data sources and variables of the current point. */
  context(scope: Scope = {}): Scope {
    const user = this.deps.userProvider.user();
    return {
      user: this.deps.i18n ? { ...user, locale: this.deps.i18n.locale() } : user,
      state: this.state(),
      params: this.params,
      settings: this.deps.settings?.() ?? {},
      data: this.data(),
      ...scope,
    };
  }

  isVisible(node: { visibleIf?: string; hiddenIf?: string }, scope: Scope = {}): boolean {
    const ctx = this.context(scope);
    return (
      this.engine.evaluateCondition(node.visibleIf, ctx, { whenMissing: true }) &&
      // hiddenIf in error => hidden (fail-closed)
      !this.engine.evaluateCondition(node.hiddenIf, ctx, { whenMissing: false, fallback: true })
    );
  }

  isEnabled(node: { enabledIf?: string }, scope: Scope = {}): boolean {
    return this.engine.evaluateCondition(node.enabledIf, this.context(scope), { whenMissing: true });
  }

  /** readOnlyIf in error => read-only (fail-closed). */
  isReadOnly(node: { readOnlyIf?: string }, scope: Scope = {}): boolean {
    return this.engine.evaluateCondition(node.readOnlyIf, this.context(scope), { whenMissing: false, fallback: true });
  }

  /** System text (generic messages of the runtime): from the `lc.*` catalogue in the active language, or the English fallback. */
  systemText(key: string, fallback: string): string {
    return this.deps.i18n ? this.deps.i18n.t(key, {}, fallback) : fallback;
  }

  /** Reports, once per screen, a translation key that exists in no language. */
  private reportMissingKey(key: string): void {
    if (this.missingKeys.has(key)) return;
    this.missingKeys.add(key);
    this.report('t()', `missing translation key: ${key}`, 'warn');
  }

  /**
   * Condition of an `if` step: true or false; null if it cannot be evaluated or is not a true/false value (reported, without
   * the text of the error, which could contain data).
   */
  condition(template: string, scope: Scope = {}): boolean | null {
    const result = this.engine.interpolate(template, this.context(scope));
    if (result.ok && typeof result.value === 'boolean') return result.value;
    this.report('if', result.ok ? 'the condition is neither true nor false' : 'condition cannot be evaluated');
    return null;
  }

  /** Named sequence of the screen (`actions`), or null if missing. */
  action(name: string): Step[] | null {
    const steps = this.definition.actions?.[name];
    return steps === undefined ? null : Array.isArray(steps) ? steps : [steps];
  }

  /** Evaluates a text with `{{ }}`; on error it returns the original text. */
  text(template: string | undefined, scope: Scope = {}): string {
    if (template === undefined) return '';
    const result = this.engine.interpolate(template, this.context(scope));
    if (!result.ok) return template;
    return result.value === null || result.value === undefined ? '' : String(result.value);
  }

  /**
   * Address of a link of the screen (`href` of a column or of a row action): the values of the expressions encoded, as in
   * the URL of a data source, and only a path of the same origin. Null, and reported, when it does not resolve: the link
   * opens nothing.
   */
  href(template: string, scope: Scope = {}): string | null {
    const url = this.resolveUrl(template, this.context(scope));
    if (url.ok) return url.value;
    this.report('href', url.error);
    return null;
  }

  /** Resolves recursively the expressions in the strings of a value (args, params). Expressions in error become `undefined`. */
  resolveValue(value: unknown, scope: Scope = {}): unknown {
    const ctx = this.context(scope);
    return this.resolveIn(value, ctx);
  }

  /**
   * Registers the check of a field in its validation group; returns the function that removes it (when the field
   * disappears). The check shows the errors of the field and tells whether it is valid.
   */
  registerValidator(group: string, check: () => boolean): () => void {
    const set = this.validators.get(group) ?? new Set();
    set.add(check);
    this.validators.set(group, set);
    return () => set.delete(check);
  }

  /**
   * Registers a standalone field in its validation group while it is on the screen; returns the function that removes it.
   * The fields of a group see each other's values in their rules (`groupValues`) and receive the field errors of the
   * services (`placeFieldErrors`).
   */
  registerField(group: string, entry: GroupField): () => void {
    this.groups.update((all) => new Map(all).set(group, [...(all.get(group) ?? []), entry]));
    return () => this.groups.update((all) => new Map(all).set(group, (all.get(group) ?? []).filter((e) => e !== entry)));
  }

  /** The standalone fields of a group. */
  groupFields(group: string): readonly GroupField[] {
    return this.groups().get(group) ?? [];
  }

  /** The values of the standalone fields of a group, by field name (read in a reactive context, they follow the state). */
  groupValues(group: string): Record<string, unknown> {
    return Object.fromEntries(this.groupFields(group).map((e) => [e.field.name, this.getState(e.path) ?? null]));
  }

  /**
   * Field errors of a service for the standalone fields (a `call` started outside a form): `/name` goes to every
   * standalone field with that name. Returns how many were placed.
   */
  placeFieldErrors(errors: readonly FieldError[]): number {
    const fields = [...untracked(() => this.groups()).values()].flat();
    let placed = 0;
    for (const error of errors) {
      const segments = pointerSegments(error.path);
      if (segments.length !== 1) continue;
      const targets = fields.filter((e) => e.field.name === segments[0]);
      for (const target of targets) target.showFieldError(error);
      if (targets.length) placed++;
    }
    return placed;
  }

  /** Checks all the fields of the group (`*` = all), without stopping at the first one: each one shows its own errors. */
  validate(group: string): boolean {
    const checks = group === '*' ? [...this.validators.values()].flatMap((s) => [...s]) : [...(this.validators.get(group) ?? [])];
    return checks.map((check) => check()).every(Boolean);
  }

  /** Browser print (the print style sheet hides the application shell). */
  print(): void {
    globalThis.print?.();
  }

  setState(path: string, value: unknown): void {
    const keys = path.replace(/^state\./, '').split('.');
    if (keys.some((k) => !k || FORBIDDEN_PATH_SEGMENTS.has(k))) {
      this.report(`set ${path}`, 'invalid state path');
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

  /** Current state of a data source. */
  source(name: string): DataSourceState {
    return this.dataSources()[name] ?? IDLE;
  }

  /**
   * Runs a data source with the given arguments (variables available to `url` and `params`). With `file` the request
   * becomes multipart: the file travels as a file and not in the JSON body. `trace`: the span of the action it starts from.
   */
  async execute(name: string, args: Record<string, unknown> = {}, scope: Scope = {}, file?: DataRequest['file'], trace?: SpanContext): Promise<CallResult> {
    const built = this.build(name, args, scope);
    if (!built.ok) {
      this.report(`call ${name}`, built.error);
      return { ok: false, error: built.error };
    }
    return this.run(name, file && built.request.method !== 'GET' && built.request.method !== 'DELETE' ? { ...built.request, file } : built.request, trace);
  }

  /**
   * Runs a data source and returns the response without touching its shared state (the rows shown by the other
   * components stay the previous ones). Used for service requests, such as resolving the text of a value. With
   * `signal` the request is its own (not shared with identical ones) and can be cancelled: a cancelled one is not an error.
   */
  async query(name: string, args: Record<string, unknown> = {}, scope: Scope = {}, trace?: SpanContext, signal?: AbortSignal): Promise<CallResult> {
    const built = this.build(name, args, scope);
    if (!built.ok) {
      this.report(`call ${name}`, built.error);
      return { ok: false, error: built.error };
    }
    const options: DataRequestOptions = { source: name, trace, signal, baggage: this.baggage(trace) };
    try {
      if (built.request.method !== 'GET' || signal) return { ok: true, data: await this.deps.data.request(built.request, options) };
      const key = `${name} ${JSON.stringify(built.request)}`;
      let shared = this.sharedQueries.get(key);
      if (!shared) {
        shared = this.deps.data.request(built.request, options);
        this.sharedQueries.set(key, shared);
        const forget = () => this.sharedQueries.delete(key);
        shared.then(forget, forget);
      }
      return { ok: true, data: await shared };
    } catch (e) {
      if (signal?.aborted) return { ok: false, error: 'cancelled' };
      const error = e instanceof Error ? e.message : String(e);
      this.report(`data source ${name}`, error);
      return { ok: false, error, status: statusOf(e) };
    }
  }

  /**
   * Reloads a data source. A GET is run again here; a data source queried directly by a component (for
   * example the search of a serverDataTable, usually POST) is only signalled through `refreshCount`, and the
   * component repeats its requests.
   */
  async refresh(name: string, trace?: SpanContext): Promise<CallResult> {
    const source = inlineDataSource(this.definition.dataSources?.[name]);
    if (!source) {
      const error = `unknown data source: ${name}`;
      this.report(`refresh ${name}`, error);
      return { ok: false, error };
    }
    this.refreshCount.update((all) => ({ ...all, [name]: (all[name] ?? 0) + 1 }));
    return source.method === 'GET' ? this.execute(name, {}, {}, undefined, trace) : { ok: true, data: null };
  }

  navigate(screen: string, params: Record<string, unknown>): void {
    this.deps.navigator.navigate(screen, params);
  }

  /** Asks for confirmation with a text that can contain expressions. Without a confirmation service it does not go on. */
  async confirm(message: string, scope: Scope = {}): Promise<boolean> {
    const confirmation = this.deps.confirmation;
    if (!confirmation) {
      this.report('confirm', 'no confirmation service available: action not run');
      return false;
    }
    return confirmation.confirm(this.text(message, scope));
  }

  /** Opens a window with a form. Without a service it does not go on; if the user cancels it returns false. */
  async openDialog(spec: DialogStep['dialog'], scope: Scope = {}): Promise<boolean> {
    const dialog = this.deps.formDialog;
    if (!dialog) {
      this.report('dialog', 'no service for form windows: action not run');
      return false;
    }
    return dialog.open({
      title: this.text(spec.title, scope),
      form: {
        type: 'form',
        fields: spec.fields,
        initial: spec.initial,
        columns: spec.columns,
        actions: [{ label: spec.submitLabel ?? this.systemText('lc.confirm', 'Confirm'), onClick: spec.onSubmit }],
      },
      runtime: this,
      scope,
    });
  }

  toast(message: string, kind: 'info' | 'error' = 'info'): void {
    this.deps.notifier.toast(message, kind);
  }

  /**
   * Reports a technical problem (an error unless `severity` says otherwise). Sending is deferred: expression errors arise
   * while templates render, where writing to a signal is forbidden, and the port implementations might do it.
   */
  report(source: string, error: string, severity: DiagnosticSeverity = 'error'): void {
    const diagnostics = this.deps.diagnostics;
    if (!diagnostics) return;
    const event = { screen: this.definition.screen, source: this.withoutSensitive(source), error: this.withoutSensitive(error), ...(severity === 'error' ? {} : { severity }) };
    queueMicrotask(() => diagnostics.report(event));
  }

  /**
   * A field marked `sensitive` (or a password) tells its current value, `owner` being the field itself: from now on
   * the technical reports of the screen show `[sensitive]` in its place, wherever it appears (an expression error, the
   * text of a failed call). Texts of fewer than 3 characters are not tracked: replacing them would hide the report itself.
   */
  markSensitive(owner: object, value: unknown): void {
    const texts = (Array.isArray(value) ? value : [value])
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map((v) => String(v).trim())
      .filter((v) => v.length >= 3);
    if (texts.length) this.sensitiveValues.set(owner, texts);
    else this.sensitiveValues.delete(owner);
  }

  /** The text with every current value of a sensitive field replaced (the longer ones first, so none is left half-hidden). */
  private withoutSensitive(text: string): string {
    const values = [...this.sensitiveValues.values()].flat().sort((a, b) => b.length - a.length);
    return values.reduce((out, value) => out.split(value).join('[sensitive]'), text);
  }

  private async run(name: string, request: DataRequest, trace?: SpanContext): Promise<CallResult> {
    const seq = (this.sequence.get(name) ?? 0) + 1;
    this.sequence.set(name, seq);
    const previous = this.source(name);
    this.setSource(name, { status: 'loading', data: previous.data });
    // A new read cancels the one of the same data source still in progress. Writes are never cancelled:
    // the service may have run them already.
    const controller = request.method === 'GET' ? new AbortController() : null;
    if (controller) {
      this.inflight.get(name)?.abort();
      this.inflight.set(name, controller);
    }
    try {
      const data = await this.deps.data.request(request, { signal: controller?.signal, source: name, trace, baggage: this.baggage(trace) });
      // An older response must not overwrite a newer one.
      if (this.sequence.get(name) === seq) this.setSource(name, { status: 'ready', data });
      return { ok: true, data };
    } catch (e) {
      // Cancelled because outdated: not an error to report or to show.
      if (controller?.signal.aborted) return { ok: false, error: 'cancelled' };
      const error = e instanceof Error ? e.message : String(e);
      const fieldErrors = fieldErrorsOf(e);
      // Data rejected field by field is an answer for the user, not a technical problem: it is not reported.
      if (!fieldErrors.length) this.report(`data source ${name}`, error);
      if (this.sequence.get(name) === seq) this.setSource(name, { status: 'error', data: null, error: this.systemText('lc.loadFailed', 'Loading failed') });
      return fieldErrors.length ? { ok: false, error, status: statusOf(e), fieldErrors } : { ok: false, error, status: statusOf(e) };
    } finally {
      if (controller && this.inflight.get(name) === controller) this.inflight.delete(name);
    }
  }

  private setSource(name: string, state: DataSourceState): void {
    this.dataSources.update((all) => ({ ...all, [name]: state }));
  }

  private build(name: string, args: Record<string, unknown>, scope: Scope = {}): Built {
    const source = inlineDataSource(this.definition.dataSources?.[name]);
    if (!source) return { ok: false, error: `unknown data source: ${name}` };
    // Arguments take precedence over the variables of the point the call starts from (row, form).
    // Variables of the components that query a data source, always present and null until needed: `search` and
    // `lookupKey` (lookup fields), `word` (text fields with suggestions), `request` (page, sorting, filters and groups
    // of a serverDataTable).
    const ctx = this.context({ search: null, lookupKey: null, word: null, request: null, ...scope, ...args });
    const url = this.resolveUrl(source.url, ctx);
    if (!url.ok) return url;
    const resolved = (this.resolveIn(source.params ?? {}, ctx) ?? {}) as Record<string, unknown>;
    // Empty values (also the empty lists of a multiple selection) do not become parameters.
    const params = Object.fromEntries(Object.entries(resolved).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)));
    if (source.method === 'GET' || source.method === 'DELETE') {
      return { ok: true, request: { method: source.method, url: url.value, query: params } };
    }
    const body = source.body === undefined ? params : this.resolveIn(source.body, ctx);
    const request: DataRequest = { method: source.method, url: url.value, body: (body ?? {}) as Record<string, unknown> };
    return { ok: true, request };
  }

  /** Replaces the expressions of the URL with encoded values and accepts only paths relative to the same origin. */
  private resolveUrl(template: string, ctx: Scope): { ok: true; value: string } | { ok: false; error: string } {
    let url = '';
    try {
      for (const segment of parseTemplate(template)) {
        if (segment.kind === 'text') {
          url += segment.text;
        } else {
          const result = this.engine.evaluate(segment.source, ctx);
          if (!result.ok || result.value === null || result.value === undefined) {
            return { ok: false, error: `missing value in the URL: ${segment.source}` };
          }
          // A setting of the application written alone (`{{ settings.ordersApi }}`) is a piece of path chosen by the author,
          // such as a base address: it goes in as it is when it holds only path characters. Every other value is data and is
          // encoded, so that it cannot add segments; the check below still accepts only relative paths.
          const text = String(result.value);
          url += SETTING_ALONE.test(segment.source) && PATH_TEXT.test(text) ? text : encodeURIComponent(text);
        }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!/^\/(?!\/)/.test(url) || url.includes('\\') || /(^|\/)\.\.(\/|$)/.test(url)) {
      return { ok: false, error: 'URL not allowed: it must be a relative path' };
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

/** State of an `input` field: `bind`, or `state.<field name>`. */
export function inputPath(node: InputNode): string {
  return node.bind ?? `state.${node.field.name}`;
}

/** Initial value of an `input` field: `default`, otherwise false for checkbox and switch and null for the others. */
export function initialInputValue(node: InputNode): unknown {
  if (node.default !== undefined) return node.default;
  return node.field.type === 'checkbox' || node.field.type === 'switch' ? false : null;
}

/**
 * HTTP code of a call error: the one of the data client error (`status`) or the one at the start of the
 * message («409», as in the clients of the demo and of the preview); 0 if missing (service unreachable).
 */
function statusOf(e: unknown): number {
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && Number.isInteger(status)) return status;
  const head = /^(\d{3})\b/.exec(e instanceof Error ? e.message : String(e));
  return head ? Number(head[1]) : 0;
}
