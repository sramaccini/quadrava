/**
 * Utilità per i test che usano `nz-select` in jsdom. Il menu delle opzioni di NG-ZORRO usa lo scorrimento virtuale
 * di CDK, che in jsdom (nessun layout) vede una finestra alta zero e non disegna nulla: la si simula alta 500px.
 */
export function stubViewportHeight(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original);
    else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  };
}

/** Apre il menu di un `nz-select` e restituisce le opzioni visibili. */
export async function openSelect(select: Element, settle: () => Promise<void>): Promise<HTMLElement[]> {
  (select.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  (select as HTMLElement).click();
  await settle();
  return [...document.body.querySelectorAll<HTMLElement>('.ant-select-item-option')];
}
