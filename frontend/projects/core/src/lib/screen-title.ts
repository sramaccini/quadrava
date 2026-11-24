import { Injectable, signal } from '@angular/core';

/**
 * Title of the screen on display, as text (its expressions resolved), or empty. The screen writes it; the application
 * shows it where it wants, for example in the title of the browser tab next to its brand.
 */
@Injectable({ providedIn: 'root' })
export class ScreenTitle {
  readonly current = signal('');
}
