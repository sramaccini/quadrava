import type { Step } from 'schema';
import { csvFileName, downloadText, rowsOf, toCsv } from './csv';
import type { FieldError } from './field-errors';
import type { SpanContext } from './ports';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';

const GENERIC_ERROR = 'Operation failed';
const genericError = (runtime: ScreenRuntime): string => runtime.systemText('lc.operationFailed', GENERIC_ERROR);

/** How many named sequences (`run`) can call one another: beyond that it is almost certainly a cycle. */
const MAX_RUN_DEPTH = 8;

/** Outcome of a step; `scope` is what the following steps see (with the response of a `call` with `as`). */
interface Outcome {
  ok: boolean;
  scope?: Scope;
}

const asList = (steps: Step | Step[]): Step[] => (Array.isArray(steps) ? steps : [steps]);

/** Where a sequence runs: depth of the nested `run`s and span of the action that contains it. */
interface Run {
  depth: number;
  trace?: SpanContext;
  onFieldErrors?: StepOptions['onFieldErrors'];
}

/** Options of a sequence started by a component. */
export interface StepOptions {
  /**
   * The field errors of a failed `call` (from the service's Problem), for the form that started the sequence: it shows them
   * on its fields and returns how many it could place.
   */
  onFieldErrors?: (errors: readonly FieldError[]) => number;
}

const SIMPLE_KINDS = ['if', 'set', 'toast', 'confirm', 'dialog', 'validate', 'print'] as const;

/** Steps of a sequence for traces: kind and name from the definition (`call save, refresh list`), never values. */
export function describeSteps(steps: Step[]): string {
  const named = (kind: string, name: string) => `${kind} ${name}`;
  return steps
    .map((step) => {
      if ('call' in step) return named('call', step.call);
      if ('run' in step) return named('run', step.run);
      if ('refresh' in step) return named('refresh', step.refresh);
      if ('navigate' in step) return named('navigate', step.navigate);
      if ('export' in step) return named('export', step.export.source);
      return SIMPLE_KINDS.find((kind) => kind in step) ?? 'step';
    })
    .join(', ')
    .slice(0, 200);
}

/**
 * Runs a sequence of steps in order. It stops at the first step that fails
 * (after running its `onError`, if any). It never throws.
 * Returns true if every step succeeded. The variables added by a step (`as` of a `call`) are seen by
 * the following steps of the same sequence.
 */
export async function runSteps(runtime: ScreenRuntime, steps: Step[], scope: Scope = {}, options: StepOptions = {}): Promise<boolean> {
  // Every sequence started by a component is an action: a span, whose children are the HTTP calls of the steps.
  const span = runtime.startSpan('action.run', { 'lowcode.action': describeSteps(steps) });
  const ok = await runSequence(runtime, steps, scope, { depth: 0, trace: span?.context, onFieldErrors: options.onFieldErrors });
  span?.end(ok);
  return ok;
}

async function runSequence(runtime: ScreenRuntime, steps: Step[], scope: Scope, run: Run): Promise<boolean> {
  let current = scope;
  for (const step of steps) {
    let outcome: Outcome = { ok: false };
    try {
      outcome = await runStep(runtime, step, current, run);
    } catch (e) {
      runtime.report('azione', e instanceof Error ? e.message : String(e));
      runtime.toast(genericError(runtime), 'error');
    }
    if (!outcome.ok) return false;
    if (outcome.scope) current = outcome.scope;
  }
  return true;
}

async function runStep(runtime: ScreenRuntime, step: Step, scope: Scope, run: Run): Promise<Outcome> {
  if ('call' in step) {
    const args = (runtime.resolveValue(step.args ?? {}, scope) ?? {}) as Record<string, unknown>;
    const result = await runtime.execute(step.call, args, scope, undefined, run.trace);
    // With `as` the following steps see the response under that name.
    if (result.ok) return { ok: true, scope: step.as ? { ...scope, [step.as]: result.data } : scope };
    // The server message is not shown to the user: it could contain internal details. The onError steps
    // see only the code (error.status) and how many field errors the form shows (error.fields).
    const fields = result.fieldErrors?.length && run.onFieldErrors ? run.onFieldErrors(result.fieldErrors) : 0;
    const fallback = fields ? runtime.systemText('lc.checkFields', 'Check the highlighted fields') : genericError(runtime);
    const handler = step.onError === undefined ? [{ toast: fallback }] : asList(step.onError);
    await runSequence(runtime, handler, { ...scope, error: { status: result.status ?? 0, fields } }, run);
    return { ok: false };
  }
  if ('if' in step) {
    // Fail-closed: a condition that cannot be evaluated runs neither branch and stops the sequence.
    const value = runtime.condition(step.if, scope);
    if (value === null) {
      runtime.toast(genericError(runtime), 'error');
      return { ok: false };
    }
    const branch = value ? step.then : step.else;
    return { ok: branch === undefined ? true : await runSequence(runtime, asList(branch), scope, run) };
  }
  if ('run' in step) {
    const steps = runtime.action(step.run);
    if (!steps || run.depth >= MAX_RUN_DEPTH) {
      runtime.report(`run ${step.run}`, steps ? 'sequences called one inside the other too many times' : 'unknown sequence');
      runtime.toast(genericError(runtime), 'error');
      return { ok: false };
    }
    return { ok: await runSequence(runtime, steps, scope, { ...run, depth: run.depth + 1 }) };
  }
  return { ok: await runSimpleStep(runtime, step, scope, run.trace) };
}

/** The steps that neither change variables nor call other steps. */
async function runSimpleStep(
  runtime: ScreenRuntime,
  step: Exclude<Step, { call: string } | { if: string } | { run: string }>,
  scope: Scope,
  trace: SpanContext | undefined,
): Promise<boolean> {
  if ('refresh' in step) {
    const result = await runtime.refresh(step.refresh, trace);
    if (!result.ok) runtime.toast(genericError(runtime), 'error');
    return result.ok;
  }
  if ('navigate' in step) {
    const params = (runtime.resolveValue(step.params ?? {}, scope) ?? {}) as Record<string, unknown>;
    runtime.navigate(step.navigate, params);
    return true;
  }
  if ('confirm' in step) {
    // If the user gives up the sequence stops silently: it is not an error.
    return runtime.confirm(step.confirm, scope);
  }
  if ('dialog' in step) {
    // Like confirm: if the user cancels the sequence stops silently.
    return runtime.openDialog(step.dialog, scope);
  }
  if ('toast' in step) {
    runtime.toast(runtime.text(step.toast, scope));
    return true;
  }
  if ('validate' in step) {
    // The fields show their own errors; a notice says why it does not go on.
    if (runtime.validate(step.validate)) return true;
    runtime.toast(runtime.systemText('lc.checkFields', 'Check the highlighted fields'), 'error');
    return false;
  }
  if ('print' in step) {
    runtime.print();
    return true;
  }
  if ('export' in step) {
    const spec = step.export;
    const args = (runtime.resolveValue(spec.args ?? {}, scope) ?? {}) as Record<string, unknown>;
    const result = await runtime.query(spec.source, args, scope, trace);
    if (!result.ok) {
      runtime.toast(genericError(runtime), 'error');
      return false;
    }
    const header = spec.columns.map((c) => (c.label ? runtime.text(c.label, scope) : c.field));
    const rows = rowsOf(result.data).map((row) => spec.columns.map((c) => row[c.field]));
    downloadText(csvFileName(spec.fileName), 'text/csv;charset=utf-8', toCsv(header, rows));
    return true;
  }
  runtime.setState(step.set.path, runtime.resolveValue(step.set.value, scope));
  return true;
}
