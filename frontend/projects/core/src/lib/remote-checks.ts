import { signal } from '@angular/core';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';

/** Outcome of a remote check of one value. */
export interface RemoteResult {
  readonly status: 'pending' | 'valid' | 'invalid' | 'failed';
  /** For `invalid`: the reason given by the service, translated by the front end. */
  readonly code?: string;
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

/** What a remote rule needs: the data source and the pause without typing. */
export interface RemoteRule {
  readonly params: Readonly<Record<string, unknown>>;
}

const PENDING: RemoteResult = { status: 'pending' };
const VALID: RemoteResult = { status: 'valid' };
const FAILED: RemoteResult = { status: 'failed' };
const DEFAULT_DEBOUNCE = 400;
const MAX_RESULTS = 200;
const CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

interface Slot {
  /** The value being checked (as a key). */
  readonly key: string;
  timer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
  start?: () => void;
  done?: Promise<void>;
}

/** The answer of the service: `true` / `false`, or `{ valid, code?, params? }`. Null for any other shape. */
export function remoteAnswer(data: unknown): RemoteResult | null {
  if (data === true) return VALID;
  if (data === false) return { status: 'invalid' };
  if (data === null || typeof data !== 'object' || typeof (data as { valid?: unknown }).valid !== 'boolean') return null;
  const { valid, code, params } = data as { valid: boolean; code?: unknown; params?: unknown };
  if (valid) return VALID;
  const clean =
    params !== null && typeof params === 'object' && !Array.isArray(params)
      ? Object.fromEntries(Object.entries(params).filter(([k, v]) => CODE.test(k) && ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 10))
      : undefined;
  return { status: 'invalid', ...(typeof code === 'string' && CODE.test(code) ? { code } : {}), ...(clean && Object.keys(clean).length ? { params: clean as RemoteResult['params'] } : {}) };
}

/**
 * Remote checks of the fields of a component (a form, a standalone field): a data source asked whether a value is valid,
 * after a pause without typing; a newer value cancels the request in progress, and the results are kept per value.
 * `result` can be read in a reactive context: it schedules the check and the reading is repeated when the result
 * arrives. Values stay in memory only.
 */
export class RemoteChecks {
  private readonly results = signal<ReadonlyMap<string, RemoteResult>>(new Map());
  private readonly slots = new Map<string, Slot>();
  private readonly reported = new Set<string>();

  constructor(private readonly runtime: ScreenRuntime) {}

  /** The outcome for `value` in `slot` (a field and its rule), starting its check if it is not known yet. */
  result(slot: string, rule: RemoteRule, value: unknown, scope: Scope): RemoteResult {
    const key = JSON.stringify(value);
    const known = this.results().get(`${slot}\u0000${key}`);
    const current = this.slots.get(slot);
    if (current?.key === key) return known ?? PENDING;
    // Another value: the check of the previous one is not needed any more.
    this.cancel(slot);
    const state: Slot = { key };
    this.slots.set(slot, state);
    if (known) return known;
    const debounce = typeof rule.params['debounce'] === 'number' ? rule.params['debounce'] : DEFAULT_DEBOUNCE;
    state.start = () => {
      state.start = undefined;
      state.timer = undefined;
      state.done = this.check(slot, state, String(rule.params['remote']), value, scope);
    };
    state.timer = setTimeout(state.start, debounce);
    return PENDING;
  }

  /** Starts at once the checks waiting for their pause and resolves when none is in progress (before sending a form). */
  async settle(): Promise<void> {
    for (const state of this.slots.values()) {
      if (state.timer !== undefined) clearTimeout(state.timer);
      state.start?.();
    }
    await Promise.all([...this.slots.values()].map((s) => s.done));
  }

  /** Cancels every check (the component goes away). */
  destroy(): void {
    for (const slot of [...this.slots.keys()]) this.cancel(slot);
  }

  private cancel(slot: string): void {
    const state = this.slots.get(slot);
    if (!state) return;
    if (state.timer !== undefined) clearTimeout(state.timer);
    state.start = undefined;
    state.controller?.abort();
    this.slots.delete(slot);
  }

  private async check(slot: string, state: Slot, source: string, value: unknown, scope: Scope): Promise<void> {
    const controller = (state.controller = new AbortController());
    const response = await this.runtime.query(source, {}, { ...scope, value }, undefined, controller.signal);
    if (controller.signal.aborted) return;
    state.controller = undefined;
    let outcome = response.ok ? remoteAnswer(response.data) : FAILED;
    if (outcome === null) {
      // A definition problem (the data source answers something else): reported once, never with the answer.
      if (!this.reported.has(source)) {
        this.reported.add(source);
        this.runtime.report(`remote ${source}`, 'the answer is neither true, false nor { valid }');
      }
      outcome = FAILED;
    }
    const result = outcome;
    this.results.update((all) => {
      const next = new Map(all);
      if (next.size >= MAX_RESULTS) next.delete(next.keys().next().value!);
      next.set(`${slot}\u0000${state.key}`, result);
      return next;
    });
  }
}
