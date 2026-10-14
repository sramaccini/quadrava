import type { Step } from 'schema';
import { csvFileName, downloadText, rowsOf, toCsv } from './csv';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';

const GENERIC_ERROR = 'Operazione non riuscita';
const genericError = (runtime: ScreenRuntime): string => runtime.systemText('lc.operationFailed', GENERIC_ERROR);

/** Quante sequenze con nome (`run`) possono richiamarsi una dentro l'altra: oltre è quasi certamente un ciclo. */
const MAX_RUN_DEPTH = 8;

/** Esito di un passo; `scope` è quello che vedono i passi seguenti (con la risposta di una `call` con `as`). */
interface Outcome {
  ok: boolean;
  scope?: Scope;
}

const asList = (steps: Step | Step[]): Step[] => (Array.isArray(steps) ? steps : [steps]);

/**
 * Esegue una sequenza di passi in ordine. Si ferma al primo passo che fallisce
 * (dopo aver eseguito il suo `onError`, se c'è). Non lancia mai eccezioni.
 * Restituisce true se tutti i passi sono riusciti. Le variabili aggiunte da un passo (`as` di una `call`) le vedono
 * i passi seguenti della stessa sequenza.
 */
export async function runSteps(runtime: ScreenRuntime, steps: Step[], scope: Scope = {}, depth = 0): Promise<boolean> {
  let current = scope;
  for (const step of steps) {
    let outcome: Outcome = { ok: false };
    try {
      outcome = await runStep(runtime, step, current, depth);
    } catch (e) {
      runtime.report('azione', e instanceof Error ? e.message : String(e));
      runtime.toast(genericError(runtime), 'error');
    }
    if (!outcome.ok) return false;
    if (outcome.scope) current = outcome.scope;
  }
  return true;
}

async function runStep(runtime: ScreenRuntime, step: Step, scope: Scope, depth: number): Promise<Outcome> {
  if ('call' in step) {
    const args = (runtime.resolveValue(step.args ?? {}, scope) ?? {}) as Record<string, unknown>;
    const result = await runtime.execute(step.call, args, scope);
    // Con `as` i passi seguenti vedono la risposta con quel nome.
    if (result.ok) return { ok: true, scope: step.as ? { ...scope, [step.as]: result.data } : scope };
    // Il messaggio del server non viene mostrato all'utente: potrebbe contenere dettagli interni. I passi di onError
    // vedono solo il codice (error.status).
    const handler = step.onError === undefined ? [{ toast: genericError(runtime) }] : asList(step.onError);
    await runSteps(runtime, handler, { ...scope, error: { status: result.status ?? 0 } }, depth);
    return { ok: false };
  }
  if ('if' in step) {
    // Fail-closed: una condizione che non si può valutare non esegue nessuno dei due rami e ferma la sequenza.
    const value = runtime.condition(step.if, scope);
    if (value === null) {
      runtime.toast(genericError(runtime), 'error');
      return { ok: false };
    }
    const branch = value ? step.then : step.else;
    return { ok: branch === undefined ? true : await runSteps(runtime, asList(branch), scope, depth) };
  }
  if ('run' in step) {
    const steps = runtime.action(step.run);
    if (!steps || depth >= MAX_RUN_DEPTH) {
      runtime.report(`run ${step.run}`, steps ? 'sequenze richiamate una dentro l\'altra troppe volte' : 'sequenza sconosciuta');
      runtime.toast(genericError(runtime), 'error');
      return { ok: false };
    }
    return { ok: await runSteps(runtime, steps, scope, depth + 1) };
  }
  return { ok: await runSimpleStep(runtime, step, scope) };
}

/** I passi che non cambiano le variabili né richiamano altri passi. */
async function runSimpleStep(runtime: ScreenRuntime, step: Exclude<Step, { call: string } | { if: string } | { run: string }>, scope: Scope): Promise<boolean> {
  if ('refresh' in step) {
    const result = await runtime.refresh(step.refresh);
    if (!result.ok) runtime.toast(genericError(runtime), 'error');
    return result.ok;
  }
  if ('navigate' in step) {
    const params = (runtime.resolveValue(step.params ?? {}, scope) ?? {}) as Record<string, unknown>;
    runtime.navigate(step.navigate, params);
    return true;
  }
  if ('confirm' in step) {
    // Se l'utente rinuncia la sequenza si ferma in silenzio: non è un errore.
    return runtime.confirm(step.confirm, scope);
  }
  if ('dialog' in step) {
    // Come confirm: se l'utente annulla la sequenza si ferma in silenzio.
    return runtime.openDialog(step.dialog, scope);
  }
  if ('toast' in step) {
    runtime.toast(runtime.text(step.toast, scope));
    return true;
  }
  if ('validate' in step) {
    // I campi mostrano i propri errori; un avviso dice perché non si procede.
    if (runtime.validate(step.validate)) return true;
    runtime.toast(runtime.systemText('lc.checkFields', 'Controlla i campi evidenziati'), 'error');
    return false;
  }
  if ('print' in step) {
    runtime.print();
    return true;
  }
  if ('export' in step) {
    const spec = step.export;
    const args = (runtime.resolveValue(spec.args ?? {}, scope) ?? {}) as Record<string, unknown>;
    const result = await runtime.query(spec.source, args, scope);
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
