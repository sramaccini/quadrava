import type { Messages } from 'core';

/**
 * Texts of the runtime shell (`app.*`: sign-in, settings, language, theme, errors of the menu and of the screens), built in
 * so that a project need not copy them. They sit in the built-in layer of `I18n`: a key in the project's catalogue
 * overrides them. The keys of the application itself stay in the project: `app.title` and the names of its themes
 * (`app.theme.<theme>`), which fall back to the identifier.
 *
 * Part of the public API, so that an editor can list the keys a project may override (for example to translate the shell
 * into a language the runtime does not ship): renaming or removing a key is a breaking change.
 */
export const SHELL_MESSAGES: Record<'en' | 'it', Messages> = {
  en: {
    'app.signIn': 'Sign in again',
    'app.signedOutTitle': 'Session ended',
    'app.signedOutText': 'You have signed out.',
    'app.loginRefusedTitle': 'Signing in did not work',
    'app.loginRefusedText': 'The server refused the session right after signing in. Try again in a moment; if it happens again, contact the administrator.',
    'app.profile': 'Profile',
    'app.settings': 'Settings',
    'app.settingsMenu': 'Settings…',
    'app.general': 'General',
    'app.debug': 'Debug',
    'app.permissions': '{n, plural, =0 {no permissions} one {# permission} other {# permissions}}',
    'app.openMenu': 'Open the menu',
    'app.language': 'Language',
    'app.lang.en': 'English',
    'app.lang.it': 'Italiano',
    'app.theme': 'Theme',
    'app.menuInvalid': 'The menu is not valid:',
    'app.screenInvalid': 'The screen is not valid:',
    'app.diagnostics': 'Technical reports: {n} (details in the browser console)',
    'app.network': 'Network',
    'app.network.normal': 'normal',
    'app.network.slow': 'slow',
    'app.network.verySlow': 'very slow',
  },
  it: {
    'app.signIn': 'Accedi di nuovo',
    'app.signedOutTitle': 'Sessione terminata',
    'app.signedOutText': "Hai effettuato l'uscita.",
    'app.loginRefusedTitle': 'Accesso non riuscito',
    'app.loginRefusedText': "Il server ha rifiutato la sessione subito dopo l'accesso. Riprova tra poco; se succede ancora, contatta l'amministratore.",
    'app.profile': 'Profilo',
    'app.settings': 'Impostazioni',
    'app.settingsMenu': 'Impostazioni…',
    'app.general': 'Generale',
    'app.debug': 'Debug',
    'app.permissions': '{n, plural, =0 {nessun permesso} one {# permesso} other {# permessi}}',
    'app.openMenu': 'Apri il menu',
    'app.language': 'Lingua',
    'app.lang.en': 'English',
    'app.lang.it': 'Italiano',
    'app.theme': 'Tema',
    'app.menuInvalid': 'Il menu non è valido:',
    'app.screenInvalid': 'La schermata non è valida:',
    'app.diagnostics': 'Segnalazioni tecniche: {n} (dettagli nella console del browser)',
    'app.network': 'Rete',
    'app.network.normal': 'normale',
    'app.network.slow': 'lenta',
    'app.network.verySlow': 'molto lenta',
  },
};
