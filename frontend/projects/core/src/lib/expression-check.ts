import type { ExpressionEngine } from 'expressions';

export interface ExpressionIssue {
  /** JSON Pointer path inside the screen, for example `/components/1/rowActions/0/visibleIf`. */
  path: string;
  expression: string;
  message: string;
}

/**
 * Static check of every `{{ }}` expression of a screen: syntax, known functions and types.
 * Used on publication and in the editor; it runs nothing.
 */
export function checkScreenExpressions(document: unknown, engine: ExpressionEngine): ExpressionIssue[] {
  const issues: ExpressionIssue[] = [];
  walk(document, '', (value, path) => {
    if (!value.includes('{{')) return;
    const result = engine.checkTemplate(value);
    if (!result.valid) issues.push({ path: path || '/', expression: value, message: result.error ?? 'invalid expression' });
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
