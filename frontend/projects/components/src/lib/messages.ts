import type { Messages } from 'core';

/**
 * Scritte della piattaforma (chiavi `lc.*`), nelle lingue fornite di serie. Le applicazioni possono sovrascrivere
 * qualunque chiave nei propri cataloghi e aggiungere altre lingue.
 */
export const BUILTIN_MESSAGES: Record<string, Messages> = {
  it: {
    'lc.all': 'Tutti',
    'lc.yes': 'Sì',
    'lc.no': 'No',
    'lc.loading': 'Caricamento…',
    'lc.noResults': 'Nessun risultato.',
    'lc.noData': 'Nessun dato.',
    'lc.confirm': 'Conferma',
    'lc.cancel': 'Annulla',
    'lc.useCase': 'Caso d’uso',
    'lc.menu': 'Menu',
    'lc.noFunctions': 'Nessuna funzione disponibile per il tuo profilo.',
    'lc.expandMenu': 'Espandi il menu',
    'lc.collapseMenu': 'Comprimi il menu',
    'lc.userMenu': 'Menu utente',
    'lc.logout': 'Esci',
    'lc.breadcrumb': 'Percorso',
    'lc.forbidden': 'Non hai i permessi per visualizzare questa schermata.',
    'lc.operationFailed': 'Operazione non riuscita',
    'lc.loadFailed': 'Caricamento non riuscito',
  },
  en: {
    'lc.all': 'All',
    'lc.yes': 'Yes',
    'lc.no': 'No',
    'lc.loading': 'Loading…',
    'lc.noResults': 'No results.',
    'lc.noData': 'No data.',
    'lc.confirm': 'Confirm',
    'lc.cancel': 'Cancel',
    'lc.useCase': 'Use case',
    'lc.menu': 'Menu',
    'lc.noFunctions': 'No functions available for your profile.',
    'lc.expandMenu': 'Expand the menu',
    'lc.collapseMenu': 'Collapse the menu',
    'lc.userMenu': 'User menu',
    'lc.logout': 'Sign out',
    'lc.breadcrumb': 'Path',
    'lc.forbidden': 'You do not have permission to view this screen.',
    'lc.operationFailed': 'Operation failed',
    'lc.loadFailed': 'Loading failed',
  },
};
