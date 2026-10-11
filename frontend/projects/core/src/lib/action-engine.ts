import type { Step } from 'schema';
import type { ScreenRuntime } from './screen-runtime';
import type { Scope } from './types';

const GENERIC_ERROR = 'Operazione non riuscita';
const genericError = (runtime: ScreenRuntime): string => runtime.systemText('lc.operationFailed', GENERIC_ERROR);

/**
 * Esegue una sequenza di passi in ordine. Si ferma al primo passo che fallisce
 * (dopo aver eseguito il suo `onError`, se c'è). Non lancia mai eccezioni.
 * Restituisce true se tutti i passi sono riusciti.
 */
export async function runSteps(runtime: ScreenRuntime, steps: Step[], scope: Scope = {}): Promise<boolean> {
  for (const step of steps) {
    let ok = false;
    try {
      ok = await runStep(runtime, step, scope);
    } catch (e) {
      runtime.report('azione', e instanceof Error ? e.message : String(e));
      runtime.toast(genericError(runtime), 'error');
    }
    if (!ok) return false;
  }
  return true;
}

async function runStep(runtime: ScreenRuntime, step: Step, scope: Scope): Promise<boolean> {
  if ('call' in step) {
    const args = (runtime.resolveValue(step.args ?? {}, scope) ?? {}) as Record<string, unknown>;
    const result = await runtime.execute(step.call, args, scope);
    if (result.ok) return true;
    // Il messaggio del server non viene mostrato all'utente: potrebbe contenere dettagli interni.
    const handler = step.onError === undefined ? [{ toast: genericError(runtime) }] : Array.isArray(step.onError) ? step.onError : [step.onError];
    await runSteps(runtime, handler, scope);
    return false;
  }
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
  runtime.setState(step.set.path, runtime.resolveValue(step.set.value, scope));
  return true;
}
