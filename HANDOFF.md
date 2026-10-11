# HANDOFF — Piattaforma LowCode

Documento di passaggio per continuare il lavoro con Claude Code in locale. Ultimo aggiornamento: 2026-10-11, dopo il commit `f42abdf` (grafici impilati e doppio asse) e l'aggiornamento della documentazione che lo segue.

## 1. Cos'è

Piattaforma low-code per frontend gestionali/amministrativi **definiti da JSON** (schermate, data source, azioni, espressioni CEL), più un editor visuale (NON iniziato) e servizi di base. Il backend consiste in contratti OpenAPI e un'implementazione di riferimento Spring Boot non destinata alla produzione (moduli Java mai compilati).

## 2. Preferenze di Simone (rispettale)

- **Chiedi approvazione prima di fare modifiche** non richieste esplicitamente; in dubbio, proponi e aspetta.
- Modalità **architectural review**: segnala incongruenze, punti mancanti, insufficienze rispetto ai requisiti.
- Documenti **in italiano** (termini tecnici in inglese), con figure ed esempi pratici spiegati semplicemente; contenuti integrati nelle sezioni pertinenti, non paragrafi di confronto isolati.
- Stack più recente; soluzioni DSL/espressioni leggere e governabili (no rule engine pesanti).
- README e DEVELOPMENT-GUIDE sono in **inglese**; `docs/README.md`, `docs/catalogo-componenti.md` e i documenti di progetto in italiano.
- Lavoro lungo e autonomo quando lo chiede: un commit per componente, test e controllo visivo prima di passare al successivo.

## 3. Stack e comandi

Angular 22.2 (standalone, signals, OnPush), TypeScript 6.0, Node 24 (nella shell di Claude Code `node` è la 20: usare `eval "$(fnm env --shell bash)"; fnm use 24.21.0`), test con vitest via `ng test` (jsdom), Ajv 8, cel-js 8, ng-zorro-antd 22.1.1, date-fns 4, Spring Boot 4.1.1, Keycloak 26.8.

Da `frontend/`:

- `npm ci` (obbligatorio dopo ogni pull che cambia le dipendenze)
- `npm run build:libs` — **prima** di build e test delle app: i path di tsconfig puntano a `./dist/*`
- `npm run schema:sync` — rigenera i `*.schema.ts` dagli schemi JSON
- `npm run validate:examples` — valida gli esempi (schema + chiavi di traduzione)
- `npm run demo:prepare` / `npm run start:runtime` — copia `examples/` in `projects/runtime/public/examples` e avvia la demo (porta 4200). Il dev server **non** ricarica `dist`: dopo modifiche a librerie o esempi va rilanciato.
- `.claude/launch.json` avvia una copia della demo sulla porta 4300 (per l'anteprima nel pannello di Claude).
- test per progetto: `npx ng test <schema|expressions|core|components|services|runtime|editor> --watch=false`

Stato test (tutti verdi): schema 60, expressions 39, core 60, components 123, services 19, runtime 65, editor 2 (**368**). Build di produzione della demo: 2,27 MB iniziali (avviso a 2,5 MB).

## 4. Architettura in breve

Librerie (`frontend/projects/`): `schema` (JSON Schema + tipi), `expressions` (CEL, template `{{ }}`, formattatore messaggi), `core` (ScreenRuntime, motore delle azioni, NavigationRuntime, I18n, porte astratte, catalogo, tema), `components` (NG-ZORRO), `services` (porte reali: HTTP/BFF/OIDC). App: `runtime` (demo/shell), `editor` (stub).

- Porte (classi astratte come token DI): Authorization, UserProvider, DataClient, ScreenNavigator, Notifier, RuntimeDiagnostics, Confirmation, **FormDialog** (passo `dialog`).
- Nodi: section, text, button, filterBar, table, **dataTable**, form, tabs, detail, alert, **stats**, **wizard**, **tree**, **calendar**, **chart**. Passi: set, call, refresh, navigate, toast, confirm, **dialog**.
- Campi: text, number, select, checkbox, date, **textarea, datetime, radio, switch, multiselect, lookup, file, repeater**. Formati: **number**, currency, percent, date, datetime, boolean, badge.
- Tabella: ordinamento (in pagina o lato server con `sort.bind`), selezione + azioni multiple, menu azioni (`rowActionsInline`), righe espandibili, celle cliccabili, riga dei totali (`aggregate`).
- `lc-node` applica `visibleIf/hiddenIf` e `tooltip`. Permessi `dominio.risorsa.azione`; espressioni **fail-closed**.
- I data source GET si ricaricano **solo se cambia la richiesta risolta** (URL e parametri); `refresh` ricarica comunque. `ScreenRuntime.query` esegue un data source senza toccarne lo stato condiviso (usato dai lookup).
- `DataRequest.file`: invio multipart dei file (`HttpDataClient` usa `FormData`), fino a 100 MB; il base64 nel JSON resta per file fino a 10 MB.
- Variabili sempre presenti nei data source: `search` e `lookupKey` (lookup), `file` nei data source di `upload`.
- Shell responsive a tre fasce (≥1200 espansa, 768–1199 compressa, <768 cassetto); pulsante tondo accanto al logo.

## 5. Catalogo componenti

`docs/catalogo-componenti.md`: specifica di ogni componente aggiunto (18, ottobre 2026), regole comuni e **limiti noti** (§ 3). La vetrina della demo ha nove schermate: Componenti base, Form, Campi e form, Filtri e tabelle, Tabelle avanzate, Datatable, Schede/dettaglio/messaggi, Cruscotto, Procedure e viste.

## 6. Trappole note (NG-ZORRO / Angular / strumenti)

Le principali sono nella DEVELOPMENT-GUIDE (§ 4, 5, 6b, 9). In breve:

- Stringhe in modal, message e titoli dell'albero sono **HTML** → componenti di contenuto, `escapeHtml` o template propri.
- Icone da registrare in `ICON_TYPES`. Array e date in `ngModel` vanno calcolati una volta per valore (`computed`), altrimenti NG0103.
- Lingua dei selettori di date: `NzDateAdapter.setLocale`. Ordinando una colonna `nz-table` azzera le altre.
- Ajv strict: `type: object` accanto a `properties`, proprietà dichiarate accanto ai `required` di `if/then`/`anyOf`.
- Script con espressioni regolari: scriverli in un file, non in un heredoc della shell (le doppie barre rovesciate si perdono).
- CEL: `has(state.x)` per chiavi che non esistono ancora; `dyn(...)` nelle mappe di parametri miste di `t()`; `{n, number}` per i numeri nei messaggi.
- Nei test: `stubViewportHeight` + attesa delle opzioni per `nz-select`; `Element.scrollTo` simulato; le finestre chiuse restano nel DOM.

## 7. Limiti noti / debito

- `services` **non è collegato** a `runtime` (la demo usa porte finte).
- BFF: mancano CSRF, forwarding delle API (con token e `traceparent`), allow-list degli host.
- Moduli Java mai compilati (`mvn verify` in sospeso).
- `validate:examples` non controlla le espressioni CEL (lo fa il test `i18n-examples.spec.ts`).
- Limiti dei componenti che restano: vedi catalogo § 3 (niente righe ripetibili annidate, datatable sulle righe caricate — provata fino a 20.000 nel componente —, grafici senza zoom né aree). I limiti della prima consegna (lookup, file, righe, albero da tastiera, volumi, grafici) sono stati superati: catalogo § 3.1.
- Documenti Claude Docs (architettura, funzionale, linee guida) non aggiornati con i componenti di ottobre: la fonte aggiornata è `docs/catalogo-componenti.md`.

## 8. Prossimi passi (nell'ordine suggerito)

1. Review dei 18 componenti (commit da `4d224fb` a `47a96ee`), del fix del runtime `9d96798` e dei limiti superati (da `7907884` a `f42abdf`).
2. Collegare `services` a `runtime` e completare il BFF (CSRF, forwarding, allow-list; il forwarding deve gestire anche i corpi multipart).
3. **Editor visuale** (`projects/editor`): albero dei nodi, pannello proprietà, anteprima, temi e menu; scelta delle chiavi di traduzione.
4. Menu: navigazione da tastiera, badge, ricerca. CEL in `validate:examples`.
5. Aggiornare i documenti Claude Docs con il catalogo nuovo.

## 9. Convenzioni di lavoro

- Commit in italiano, descrittivi, uno per componente. Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dopo ogni modifica al codice: `build:libs`, test dei progetti toccati, `validate:examples` se si toccano esempi o schemi; per la UI controllo nel browser (demo sulla 4300).
- Gli schemi JSON sono la fonte: modificare `*.schema.json`, poi `schema:sync`, poi i tipi in `schema/src/lib/types.ts`.
- Ogni componente nuovo: schema, tipo, componente registrato in `STANDARD_COMPONENTS`, test (schema in `schema/new-components.spec.ts`, componente in `components/*.spec.ts` con `renderScreen`, vetrina in `runtime/vetrina-avanzata.spec.ts` con `openShowcase`), esempio in `examples/vetrina-*.json` con testi in `examples/i18n/it.json` ed `en.json`.
- Mai colori scritti a mano nei componenti: `var(--lc-*)` o token NG-ZORRO. Mai testo utente nei componenti: `runtime().text(...)` o chiavi `lc.*` in `messages.ts` (it ed en).
- Sicurezza (non negoziabile): niente HTML da dati o traduzioni, espressioni fail-closed, nessun valore di dato nelle diagnostiche, l'enforcement vero sta nel backend.

## 10. Riferimenti

- `README.md`, `DEVELOPMENT-GUIDE.md` (inglese), `docs/README.md`, `docs/catalogo-componenti.md` (italiano).
- Documenti Claude Docs: architettura `81cf6668-1f89-4814-aa01-06ef8b99ee8d`, funzionale `d3763c98-122d-4331-b9c4-2c4f18cffd1c`, linee guida `f286ccf2-9ad4-4470-8f34-da217be64031`, panoramica testi/i18n `b7da8557-c708-422d-be72-d1829a0b03e7`.
- Cronologia recente: `f42abdf` grafici impilati e doppio asse, `4a8379c` datatable per grandi volumi, `e783fbb` albero da tastiera, `b130599` lookup e file nelle righe, `62fe0ee` file in multipart, `7907884` testo dei valori nel lookup; `47a96ee` datatable … `2b51e38` ordinamento, `4d224fb` catalogo; `9d96798` fix ricaricamento data source; `85d0409` guscio responsive; `5230022` i18n completo.
