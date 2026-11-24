/**
 * The close button of the NG-ZORRO dialogs has a name written in English («Close») that the library does not translate.
 * Each one that appears in the page gets the name in the language of the user. Only added elements are looked at, so the
 * cost is nothing while no dialog opens; the caller disconnects the observer when the application ends.
 */
export function localizeDialogClose(doc: Document, label: () => string): MutationObserver | null {
  const view = doc.defaultView;
  if (!view?.MutationObserver || !doc.body) return null;
  const name = (button: Element): void => {
    const text = label();
    if (button.getAttribute('aria-label') !== text) button.setAttribute('aria-label', text);
  };
  const observer = new view.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const element = node as Element;
        if (element.matches('button.ant-modal-close')) name(element);
        for (const button of element.querySelectorAll('button.ant-modal-close')) name(button);
      }
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  for (const button of doc.querySelectorAll('button.ant-modal-close')) name(button);
  return observer;
}
