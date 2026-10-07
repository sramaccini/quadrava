import type { ExpressionEngine } from 'expressions';

export interface ExpressionIssue {
  /** Percorso JSON Pointer dentro la schermata, per esempio `/components/1/rowActions/0/visibleIf`. */
  path: string;
  expression: string;
  message: string;
}

/**
 * Controllo statico di tutte le espressioni `{{ }}` di una schermata: sintassi, funzioni e tipi noti.
 * Si usa alla pubblicazione e nell'editor; non esegue nulla.
 */
export function checkScreenExpressions(document: unknown, engine: ExpressionEngine): ExpressionIssue[] {
  const issues: ExpressionIssue[] = [];
  walk(document, '', (value, path) => {
    if (!value.includes('{{')) return;
    const result = engine.checkTemplate(value);
    if (!result.valid) issues.push({ path: path || '/', expression: value, message: result.error ?? 'espressione non valida' });
  });
  return issues;
}

function walk(value: unknown, path: string, visit: (text: string, path: string) => void): void {
  if (typeof value === 'string') {
    visit(value, path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}/${i}`, visit));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}/${k}`, visit);
  }
}
