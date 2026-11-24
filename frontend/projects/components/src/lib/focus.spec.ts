import { TestBed } from '@angular/core/testing';
import { DialogOpener, returnFocus } from './dialog-focus';
import { plain, renderScreen } from './screen-testing';
import { contrast, focusRing, NZ_CONTRAST_CSS, themeToNzVars } from './theme-bridge';

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
};

describe('focus', () => {
  describe('the focus ring', () => {
    it('stands out on the background and on the surfaces, in light and dark themes', () => {
      for (const [primary, background, surface] of [
        ['#9ec5ff', '#f4f6f9', '#ffffff'], // pale primary on a light theme: darkened
        ['#1f5fbf', '#f4f6f9', '#ffffff'], // already enough: unchanged
        ['#1f3f7f', '#101418', '#1c2128'], // dark primary on a dark theme: lightened
      ]) {
        const ring = focusRing(primary, background, surface);
        expect(contrast(ring, background)).toBeGreaterThanOrEqual(3);
        expect(contrast(ring, surface)).toBeGreaterThanOrEqual(3);
      }
      expect(focusRing('#1f5fbf', '#f4f6f9', '#ffffff')).toBe('#1f5fbf');
    });

    it('comes from the theme and is drawn on whatever takes the focus from the keyboard', () => {
      const vars = themeToNzVars({
        schemaVersion: '1.0',
        theme: 'test',
        mode: 'light',
        tokens: { colors: { primary: '#9ec5ff', onPrimary: '#000', background: '#f4f6f9', surface: '#fff', onSurface: '#111', border: '#ccc' } },
      });
      expect(contrast(vars['--lc-focus-ring'], '#ffffff')).toBeGreaterThanOrEqual(3);
      expect(NZ_CONTRAST_CSS).toMatch(/:focus-visible[^{]*\{\s*outline: 2px solid var\(--lc-focus-ring/);
    });
  });

  describe('back to the opener', () => {
    afterEach(() => document.body.replaceChildren());

    it('a button disabled while its action runs takes the focus back as soon as it is enabled', async () => {
      const button = document.body.appendChild(document.createElement('button'));
      button.disabled = true;
      returnFocus(button);
      expect(document.activeElement).toBe(document.body);
      button.disabled = false;
      await waitFor(() => document.activeElement === button);
      expect(document.activeElement).toBe(button);
    });

    it('does not take the focus from where the user moved it in the meantime', async () => {
      const button = document.body.appendChild(document.createElement('button'));
      const other = document.body.appendChild(document.createElement('input'));
      button.disabled = true;
      returnFocus(button);
      other.focus();
      button.disabled = false;
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(document.activeElement).toBe(other);
    });

    it('for an item of a «⋯» menu the opener is the button of the menu', () => {
      const opener = TestBed.inject(DialogOpener);
      const trigger = document.body.appendChild(document.createElement('button'));
      trigger.className = 'ant-dropdown-trigger';
      trigger.click();
      const menu = document.body.appendChild(document.createElement('div'));
      menu.className = 'ant-dropdown';
      const item = menu.appendChild(document.createElement('li'));
      item.className = 'ant-dropdown-menu-item';
      item.click();
      // The menu closes and the item disappears with it.
      menu.remove();
      expect(opener.current()).toBe(trigger);
    });

    it('closing a confirmation gives the focus back to the button that asked for it', async () => {
      const h = await renderScreen({ components: [{ type: 'button', label: 'Send', onClick: [{ confirm: 'Send the report?' }, { toast: 'Sent' }] }] });
      const send = [...h.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => plain(b.textContent) === 'Send')!;
      send.focus();
      send.click();
      await h.until(() => !!document.querySelector('.lc-confirm'), 'confirmation');
      const cancel = [...document.querySelectorAll<HTMLButtonElement>('.lc-confirm button')].find((b) => plain(b.textContent) === 'Cancel')!;
      cancel.click();
      await h.until(() => document.activeElement === send, 'focus back on the button');
      expect(h.toasts).toEqual([]);
    });
  });
});
