/**
 * Helpers for tests that use `nz-select` in jsdom. The NG-ZORRO options menu uses CDK virtual scrolling,
 * which in jsdom (no layout) sees a zero-height viewport and draws nothing: it is simulated as 500px high.
 */
export function stubViewportHeight(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 500 });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original);
    else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  };
}

/** Opens the menu of an `nz-select` and returns the visible options. */
export async function openSelect(select: Element, settle: () => Promise<void>): Promise<HTMLElement[]> {
  (select.querySelector('.ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  (select as HTMLElement).click();
  await settle();
  return [...document.body.querySelectorAll<HTMLElement>('.ant-select-item-option')];
}
