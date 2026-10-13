# HANDOFF — Piattaforma LowCode

Documento di passaggio per continuare il lavoro con Claude Code in locale. Ultimo aggiornamento: 2026-10-13, dopo i campi a sé (`input`) e i contenitori di layout (`box`, `grid`, `border`).

## 1. Cos'è

Piattaforma low-code per frontend gestionali/amministrativi **definiti da JSON** (schermate, data source, azioni, espressioni CEL), più un editor visuale (schermate, navigazione, temi) e servizi di base. Il backend consiste in contratti OpenAPI e un'implementazione di riferimento Spring Boot non destinata alla produzione (compila e i test passano con `mvn verify`, JDK 21 e Maven 3.9, anche in CI).

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
- `npm run start:editor` — editor visuale sulla porta 4201 (prepara anche gli esempi, con `examples/index.json`).
- `.claude/launch.json` avvia una copia della demo sulla porta 4300, dell'editor sulla 4301 e delle due app in modalità registro sulla 4302 e 4303 (per l'anteprima nel pannello di Claude).
- Registro locale senza Keycloak: `java -jar reference/registry/target/lowcode-registry-0.1.0-SNAPSHOT.jar --spring.profiles.active=senza-auth`, poi `npm run publish:examples`, poi `npm run start:runtime:registro` / `start:editor:registro`.
- `runtime-config.json` (cartella pubblica del runtime) decide da dove vengono le definizioni: `examples` (demo) o `registry` (app, ambiente, navigazione, temi); la configurazione `registro` di angular.json usa `projects/runtime/config/registro/`. Con `services: { source: 'bff', appId }` il runtime usa le porte vere di `services` (configurazione `bff`, `projects/runtime/config/bff/`).
- **Stack completo con Keycloak** (Docker Desktop avviato): `cd idp && docker compose up -d`; in `reference/` `mvn -q package -DskipTests` e `java -jar <modulo>/target/*.jar` per registry, authz, telemetry, bff; in `frontend/` `npm run demo-api` (8084), `npm run publish:examples -- --user amministratore --password amministratore`, poi `npm run start:runtime:bff` (4200) e `start:editor:bff` (4201). `.claude/launch.json` ha `runtime-bff` e `editor-bff` sulle stesse porte (le origini ammesse dal BFF sono 4200 e 4201). Il registro tiene i dati in memoria: dopo un riavvio va ripubblicato.
- test per progetto: `npx ng test <schema|expressions|core|components|services|runtime|editor> --watch=false`

Stato test (tutti verdi): schema 68, expressions 39, core 61, components 141, services 24, runtime 74, editor 56 (**463**); Java 20 (authz 4, bff 8, registry 5, telemetry 3). Build di produzione riuscite: runtime 2,32 MB iniziali, editor 2,45 MB (avviso a 2,5 MB: vedi § 8b, punto 3).

## 4. Architettura in breve

Librerie (`frontend/projects/`): `schema` (JSON Schema + tipi), `expressions` (CEL, template `{{ }}`, formattatore messaggi), `core` (ScreenRuntime, motore delle azioni, NavigationRuntime, I18n, porte astratte, catalogo, tema), `components` (NG-ZORRO), `services` (porte reali: HTTP/BFF/OIDC). App: `runtime` (demo/shell), `editor` (editor visuale, vedi § 5b).

- Porte (classi astratte come token DI): Authorization, UserProvider, DataClient, ScreenNavigator, Notifier, RuntimeDiagnostics, Confirmation, **FormDialog** (passo `dialog`).
- Nodi: section (anche `layout: "row"`), **box, grid, border** (contenitori di layout; i figli dichiarano `grow`, `span`, `region`), **input** (campo a sé legato allo stato), text, button, filterBar, table, **dataTable**, **serverDataTable**, form, tabs, detail, alert, **stats**, **wizard**, **tree**, **calendar**, **chart**. Passi: set, call, refresh, navigate, toast, confirm, **dialog**.
- Campi: text, number, select, checkbox, date, **textarea, datetime, radio, switch, multiselect, lookup, file, repeater**. Formati: **number**, currency, percent, date, datetime, boolean, badge.
- Tabella: ordinamento (in pagina o lato server con `sort.bind`), selezione + azioni multiple, menu azioni (`rowActionsInline`), righe espandibili, celle cliccabili, riga dei totali (`aggregate`).
- `lc-node` applica `visibleIf/hiddenIf` e `tooltip`, ed espone `data-node-id`/`data-node-type` (per l'editor e i test). Permessi `dominio.risorsa.azione`; espressioni **fail-closed**.
- I data source GET si ricaricano **solo se cambia la richiesta risolta** (URL e parametri); `refresh` ricarica comunque. `ScreenRuntime.query` esegue un data source senza toccarne lo stato condiviso (usato dai lookup e dalla serverDataTable). `refresh` su un data source non GET incrementa solo `ScreenRuntime.refreshCount`, che la serverDataTable osserva per ricaricarsi.
- `DataRequest.file`: invio multipart dei file (`HttpDataClient` usa `FormData`), fino a 100 MB; il base64 nel JSON resta per file fino a 10 MB.
- Variabili sempre presenti nei data source: `search` e `lookupKey` (lookup), `request` (serverDataTable, contratto nel catalogo § 2.19), `file` nei data source di `upload`.
- Shell responsive a tre fasce (≥1200 espansa, 768–1199 compressa, <768 cassetto); pulsante tondo accanto al logo.

## 5. Catalogo componenti

`docs/catalogo-componenti.md`: specifica di ogni componente aggiunto (21, ottobre 2026; 19 serverDataTable, 20 campi a sé, 21 contenitori di layout), regole comuni e **limiti noti** (§ 3). La vetrina della demo ha undici schermate: Componenti base, Form, Contenitori di layout, Campi a sé, Campi e form, Filtri e tabelle, Tabelle avanzate, Datatable, Schede/dettaglio/messaggi, Cruscotto, Procedure e viste.

## 5b. Editor visuale

`docs/editor.md` descrive tutto. In breve: tavolozza (clic o trascinamento), struttura (seleziona, sposta, duplica, taglia/incolla, trascina), pannello delle proprietà **generato da `screen.schema.json`** (elenchi di colonne/campi/azioni/passi modificabili elemento per elemento, passi per variante, oggetti come gruppi), anteprima con il runtime vero e porte finte (dati di esempio per data source, permessi, larghezze, parametri, registro; Alt+clic seleziona), vista JSON, pannello dei data source (rinomina con aggiornamento dei riferimenti), pannello dei testi (rendi traducibile, traduzioni it/en applicate all'anteprima, esportazione per i cataloghi), problemi (schema, CEL, id ripetuti, data source mancanti), cronologia di annullamento, bozza nel browser, apri esempio / importa / esporta. Un componente nuovo richiede solo il modello in `model/templates.ts`, il gruppo nella tavolozza e `ed.type.<tipo>` nei messaggi.

Modalità «Navigazione» (selettore nella barra): struttura di casi d'uso/gruppi/voci con «+ Caso d'uso / Gruppo / Voce», campi da `navigation.schema.json`, anteprima del menu vero con profilo simulato (permessi da spegnere), problemi (schema, id ripetuti tra fratelli, schermate non note, default inesistente). Modalità «Tema»: token dai campi dello schema dei temi (selettore per i colori), anteprima della schermata e del menu correnti con il tema. **Anteprime in iframe** (ADR-08): la stessa app con `?anteprima` (`PreviewApp`, `preview-config.ts`), messaggi definiti in `preview/protocol.ts` (stato → anteprima; pronto, selezione, eventi → editor), solo stessa origine e proprio iframe; lo stato arriva clonato e l'anteprima confronta per contenuto per non ridisegnare a ogni selezione. `DocumentState` è la base comune; `ed-fields` e la vista JSON lo iniettano, e l'editor della navigazione lo ridirige su `NavigationStore` con un provider.

## 6. Trappole note (NG-ZORRO / Angular / strumenti)

Le principali sono nella DEVELOPMENT-GUIDE (§ 4, 5, 6b, 9). In breve:

- Stringhe in modal, message e titoli dell'albero sono **HTML** → componenti di contenuto, `escapeHtml` o template propri.
- Icone da registrare in `ICON_TYPES`. Array e date in `ngModel` vanno calcolati una volta per valore (`computed`), altrimenti NG0103.
- Lingua dei selettori di date: `NzDateAdapter.setLocale`. Ordinando una colonna `nz-table` azzera le altre.
- Ajv strict: `type: object` accanto a `properties`, proprietà dichiarate accanto ai `required` di `if/then`/`anyOf`.
- Script con espressioni regolari: scriverli in un file, non in un heredoc della shell (le doppie barre rovesciate si perdono).
- CEL: `has(state.x)` per chiavi che non esistono ancora; `dyn(...)` nelle mappe di parametri miste di `t()`; `{n, number}` per i numeri nei messaggi.
- Nei test: `stubViewportHeight` + attesa delle opzioni per `nz-select`; `Element.scrollTo` simulato; le finestre chiuse restano nel DOM.
- `provideNzIcons` non si somma: una seconda chiamata sostituisce le icone di `provideLowcodeComponents` (l'editor le ripete).
- NG-ZORRO 22: `NzTooltipModule` (non `NzToolTipModule`), `nz-tabs` (non `nz-tabset`), niente `nzAutosize` sulle textarea (si usa `field-sizing: content`). Angular non ha il modificatore `.capture` negli eventi: `addEventListener(..., true)`.
- `nz-input` (NG-ZORRO 22) ha un input `readonly` che scrive l'attributo: legare `[readonly]`, mai `[readOnly]`. Un campo si disegna in `lc-field-control`, condiviso da form e `input`.
- Dopo `build:libs` riavviare i dev server: uno rimasto acceso mentre `dist` si ricompila fallisce («module 'components' could not be found») finché non si riavvia.
- Messaggi con graffe letterali (`{{ }}`, JSON): vanno scritte `\\{` `\\}` nel sorgente TypeScript.

## 7. Limiti noti / debito

- Runtime: in modalità `bff` usa `provideLowcodeServices` (sessione, autorizzazione, data client, telemetria) e `BffShellSession` (nome utente, numero di permessi, «Esci»); in demo le porte finte e `DemoShellSession`. La logica dei dati della demo sta in `runtime/src/demo/demo-backend.ts`, usata sia da `MockDataClient` sia da `tools/demo-api.mjs` (backend `/api` di sviluppo, verifica dei JWT RS256 sul JWKS del realm).
- BFF (`reference/bff`): rotte `/registry`, `/authz`, `/telemetry`, `/api` (8081–8084) con il token dell'utente (rinnovato) e `traceparent`; 401 per le API senza sessione, login diretto per le pagine; CSRF per SPA; `/bff/login?return=` solo verso `frontend-origins`; radice → `lowcode.bff.home`; uscita con logout OIDC di Keycloak (risposta JSON `{"redirect"}` alle chiamate delle app). **Provato dal vivo il 13 ottobre 2026** con Keycloak 26.8: login, ritorno al runtime, definizioni dal registro, permessi da authz, dati e scrittura con CSRF, uscita che chiude la sessione Keycloak, nuovo accesso con un altro utente; editor dietro il BFF che salva e pubblica (autore = nome utente).
- Moduli Java: `mvn verify` passa in locale (authz 4, bff 8, registry 5, telemetry 3); in CI dal 13 ottobre 2026 (`.github/workflows/ci.yml`); manca il kit di conformità per i backend dei clienti. Archivi in memoria.
- Realm di sviluppo: client pubblico `lowcode-strumenti` (solo password grant) per gli script; il permesso `vetrina.componenti.leggi` è nei tre ruoli di authz.
- `validate:examples` non controlla le espressioni CEL (lo fa il test `i18n-examples.spec.ts`).
- Limiti dei componenti che restano: vedi catalogo § 3 (niente righe ripetibili annidate, datatable sulle righe caricate — provata fino a 20.000 nel componente —, grafici senza zoom né aree). I limiti della prima consegna (lookup, file, righe, albero da tastiera, volumi, grafici) sono stati superati: catalogo § 3.1.
- Architettura (Claude Docs) § 9: paragrafo «Stato al 12 ottobre 2026» sull'editor e sugli scostamenti da ADR-08/09. Documenti Claude Docs aggiornati l'11 ottobre 2026 con una sintesi (funzionale: RF-DEF-18…21; architettura: § 4 «Aggiornamenti di ottobre 2026»; linee guida: § 6 e § 11); il dettaglio resta in `docs/catalogo-componenti.md`.

## 8. Prossimi passi (nell'ordine suggerito)

1. Review dei 18 componenti (commit da `4d224fb` a `47a96ee`), del fix del runtime `9d96798`, dei limiti superati (da `7907884` a `f42abdf`), della serverDataTable (`9bae9b7`) e dell'editor (da `5840c9c` a `b3d7a5d`).
2. **Editor grafico**, prossima fase (vedi § 8b per l'elenco completo di cosa manca e delle ottimizzazioni proposte).
3. **Editor visuale**, seconda fase: flusso di revisione prima della pubblicazione (stato `in-revisione` del contratto); completamento delle espressioni (vedi `docs/editor.md` § 6).
4. Menu: navigazione da tastiera, badge, ricerca. CEL in `validate:examples`.
5. Decise il 13 ottobre 2026: ADR-08 accettata (anteprima in iframe, fatta), ADR-09 modificata (cronologia a versioni immutabili), registro a documenti separati (schermate, navigazione, temi): contratto `registry.yaml` 0.2, registro di riferimento, pannello «Registro» dell'editor, inoltro nel BFF e runtime che carica dal registro fatti. Provato dal vivo senza Keycloak (profilo `senza-auth`) e, il 13 ottobre, con Keycloak e tutti i servizi dietro il BFF.

## 8b. Cosa manca e ottimizzazioni proposte (13 ottobre 2026)

**Cosa manca.**

1. *Qualità e rilascio*: CI su GitHub Actions (frontend, e2e, Java) e una prima suite Playwright (`frontend/e2e`, 4 test: campi a sé e border layout), da allargare ad altre schermate e browser; nessun controllo automatico di accessibilità (axe); manca il kit di conformità ai contratti per i backend dei clienti.
2. *Registro e ciclo di vita*: archivio in memoria (da rendere persistente); revisione prima della pubblicazione (stato `in-revisione`); confronto tra versioni; promozione tra ambienti (sviluppo → collaudo → produzione); validazione di schema ed espressioni **alla pubblicazione**, nel servizio.
3. *Editor*: completamento delle espressioni; modifica diretta nell'anteprima (trascinare e ridimensionare sul disegno); anteprima con dati veri del backend (oggi solo dati d'esempio); avviso di modifiche concorrenti sullo stesso documento.
4. *Componenti*: un gruppo di validazione a livello di schermata (oggi i campi a sé mostrano gli errori ma non bloccano i pulsanti); esportazione CSV/Excel e stampa; componenti di base ancora assenti (immagine, link, tag/badge, barra di avanzamento, timeline, kanban); divisori trascinabili nel border layout; menu con tastiera, badge e ricerca.
5. *Piattaforma*: cataloghi delle lingue da un servizio; CSP senza `unsafe-eval` (Ajv precompilato).

**Ottimizzazioni proposte**, in ordine di rapporto beneficio/costo:

1. **Test e2e più ampi**: CI e prima suite Playwright ci sono (13 ottobre 2026); allargarla alle altre schermate della vetrina, a Firefox/WebKit e agli screenshot di confronto.
2. **Validare una volta, alla pubblicazione**: il registro valida schema e CEL e marca la versione; il runtime non compila più Ajv nel browser (meno peso e niente `unsafe-eval`) e mette in cache le versioni pubblicate, immutabili per hash (`Cache-Control: immutable`).
3. **Caricamento differito dei componenti pesanti**: grafici, calendario, datatable e albero caricati alla prima schermata che li usa (`import()` nel catalogo): il bundle iniziale (runtime 2,32 MB, editor 2,45 MB, avviso a 2,5 MB) scende sensibilmente.
4. **Richieste dei data source**: annullare quella in corso quando la richiesta risolta cambia (`AbortController`), unire le richieste identiche contemporanee, attendere una breve pausa quando lo stato cambia in raffica. Oggi solo la datatable lato server scarta le risposte superate.
5. **Espressioni**: cache delle espressioni CEL compilate per testo (oggi ogni valutazione analizza di nuovo); a regime, grafo delle dipendenze tra stato e data source per ricalcolare solo ciò che cambia.
6. **Avvio in un comando**: un `docker compose` con Keycloak e i servizi di riferimento, e uno script che avvia demo-api e i due frontend.
7. **Pulizia**: la barra dei filtri riusi `lc-field-control` come form e `input`; documentazione delle proprietà generata dallo schema (le descrizioni ci sono già).

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
- Cronologia recente: `b3d7a5d` editor: trascinamento, `221ae42` suggerimenti, `ab5057a` anteprima collegata, `8d7e462` elenchi campo per campo, `5840c9c` prima versione dell'editor; `9bae9b7` serverDataTable; `f42abdf` grafici impilati e doppio asse, `4a8379c` datatable per grandi volumi, `e783fbb` albero da tastiera, `b130599` lookup e file nelle righe, `62fe0ee` file in multipart, `7907884` testo dei valori nel lookup; `47a96ee` datatable … `2b51e38` ordinamento, `4d224fb` catalogo; `9d96798` fix ricaricamento data source; `85d0409` guscio responsive; `5230022` i18n completo.
