import type { I18n } from 'core';
import { getIn, isObject, samePath, type Path } from '../model/doc-ops';
import type { EditorStore } from '../model/editor-store';
import { ownerOf, targetAt } from '../model/schema-info';
import type { MenuItem } from './menu-bar.component';

/**
 * The context menu of an element of a screen (a node, a tab, a step), the same in the outline and in the preview: cut,
 * copy, paste, duplicate, delete, move, add a tab or a step, wrap in a container, select the container. On a node of a
 * multiple selection the commands apply to all the nodes selected together.
 */
export function nodeMenuItems(store: EditorStore, i18n: I18n, path: Path): MenuItem[] {
  const t = (key: string) => i18n.t(key);
  const doc = store.doc();
  const multi = store.multi();
  if (multi.length > 1 && multi.some((p) => samePath(p, path))) {
    const n = { n: multi.length };
    return [
      { id: 'wrap-section', label: i18n.t('ed.ctx.wrapManySection', n), run: () => store.wrapMany(multi, 'section') },
      { id: 'wrap-box', label: i18n.t('ed.ctx.wrapManyBox', n), run: () => store.wrapMany(multi, 'box') },
      { id: 'wrap-grid', label: i18n.t('ed.ctx.wrapManyGrid', n), run: () => store.wrapMany(multi, 'grid') },
      { id: 'delete', label: i18n.t('ed.ctx.deleteMany', n), shortcut: t('ed.key.delete'), separator: true, run: () => store.removeMany(multi) },
    ];
  }
  const node = targetAt(doc, path)?.kind === 'node';
  const list = getIn(doc, path.slice(0, -1));
  const index = path.at(-1) as number;
  const first = index === 0;
  const last = !Array.isArray(list) || index === list.length - 1;
  const value = getIn(doc, path);
  const type = isObject(value) ? value['type'] : undefined;
  const items: MenuItem[] = [];
  if (node) {
    items.push(
      { id: 'cut', label: t('ed.menu.cut'), shortcut: 'Ctrl+X', run: () => store.cut(path) },
      { id: 'copy', label: t('ed.menu.copy'), shortcut: 'Ctrl+C', run: () => store.copy(path) },
      { id: 'paste', label: t('ed.menu.paste'), shortcut: 'Ctrl+V', disabled: !store.clipboard(), run: () => store.paste() },
    );
  }
  items.push(
    { id: 'duplicate', label: t('ed.menu.duplicate'), shortcut: 'Ctrl+D', separator: node, run: () => store.duplicate(path) },
    { id: 'delete', label: t('ed.menu.delete'), shortcut: t('ed.key.delete'), run: () => store.remove(path) },
    { id: 'move-up', label: t('ed.menu.moveUp'), shortcut: 'Alt+↑', separator: true, disabled: first, run: () => store.move(path, -1) },
    { id: 'move-down', label: t('ed.menu.moveDown'), shortcut: 'Alt+↓', disabled: last, run: () => store.move(path, 1) },
  );
  if (type === 'tabs' || type === 'wizard') {
    items.push({ id: 'add-item', label: t(type === 'tabs' ? 'ed.addTab' : 'ed.addStep'), run: () => store.addContainerItem(path) });
  }
  if (node) {
    items.push(
      { id: 'wrap-section', label: t('ed.ctx.wrapSection'), separator: true, run: () => store.wrap(path, 'section') },
      { id: 'wrap-box', label: t('ed.ctx.wrapBox'), run: () => store.wrap(path, 'box') },
      { id: 'wrap-grid', label: t('ed.ctx.wrapGrid'), run: () => store.wrap(path, 'grid') },
    );
  }
  const parent = ownerOf(doc, path.slice(0, -1));
  items.push({ id: 'select-parent', label: t('ed.ctx.selectParent'), separator: true, run: () => store.select(parent) });
  return items;
}
