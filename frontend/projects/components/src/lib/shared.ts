/** Stili condivisi dai componenti: usano solo le variabili del tema (--lc-*), mai colori fissi. */
export const CONTROL_STYLES = `
  .lc-btn {
    height: var(--lc-control-height, 38px); padding: 0 calc(var(--lc-gap, 12px) * 1.2);
    border: 1px solid var(--lc-color-primary, #1f5fbf); border-radius: var(--lc-radius, 6px);
    background: var(--lc-color-primary, #1f5fbf); color: var(--lc-color-on-primary, #fff);
    font: inherit; cursor: pointer;
  }
  .lc-btn.secondary { background: transparent; color: var(--lc-color-primary, #1f5fbf); }
  .lc-btn:disabled { opacity: .5; cursor: not-allowed; }
  .lc-btn:focus-visible, .lc-input:focus-visible { outline: 2px solid var(--lc-color-primary, #1f5fbf); outline-offset: 2px; }
  .lc-field { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
  .lc-field label { font-size: .85em; color: var(--lc-color-muted, #5d6b7a); }
  .lc-input {
    height: var(--lc-control-height, 38px); padding: 0 var(--lc-gap, 12px);
    border: 1px solid var(--lc-color-border, #d5dbe3); border-radius: var(--lc-radius, 6px);
    background: var(--lc-color-surface, #fff); color: var(--lc-color-on-surface, #1b2430); font: inherit;
  }
  .lc-input:disabled, .lc-input[readonly] { opacity: .7; }
  .lc-error { color: var(--lc-color-danger, #c62828); font-size: .85em; }
`;

let counter = 0;
/** Identificatore univoco per collegare etichette e controlli. */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
