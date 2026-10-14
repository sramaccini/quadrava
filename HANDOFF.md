# HANDOFF — KinetiX

Documento di passaggio per continuare il lavoro con Claude Code in locale. Ultimo aggiornamento: 2026-10-13 sera, dopo il lavoro autonomo su tutto l'elenco di § 8b (registro 0.3, editor, componenti, menu, traduzioni dal registro, ottimizzazioni, accessibilità, stack in un comando).

## 1. Cos'è

**KinetiX** è una piattaforma low-code per frontend gestionali/amministrativi **definiti da JSON** (schermate, data source, azioni, espressioni CEL), più l'editor visuale **KinetiX Studio** (schermate, navigazione, temi) e servizi di base. Il backend consiste in contratti OpenAPI e un'implementazione di riferimento Spring Boot non destinata alla produzione (compila e i test passano con `mvn verify`, JDK 21 e Maven 3.9, anche in CI).

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
- **`npm run stack`** — tutto lo stack con il login vero in un comando (Keycloak in Docker, servizi Java, backend della demo, esempi pubblicati, runtime 4200 ed editor 4201 dietro il BFF); log in `.stack/logs`, dati del registro in `data/registry`; Ctrl+C ferma tutto tranne Keycloak
- `npm run schema:sync` — rigenera i `*.schema.ts` e i validatori precompilati (`validators.generated.ts`) dagli schemi JSON; `schema:docs` rigenera `docs/riferimento-schema.md`
- `npm run conformance:registry` / `conformance:authz` / `conformance:telemetry` — kit di conformità dei servizi ai contratti (vedi README)
- `npm run e2e` — Playwright (campi a sé, border layout, accessibilità axe su tutta la vetrina)
- `npm run validate:examples` — valida gli esempi (schema + chiavi di traduzione)
- `npm run demo:prepare` / `npm run start:runtime` — copia `examples/` in `projects/runtime/public/examples` e avvia la demo (porta 4200). Il dev server **non** ricarica `dist`: dopo modifiche a librerie o esempi va rilanciato.
- `npm run start:editor` — KinetiX Studio (editor visuale) sulla porta 4201 (prepara anche gli esempi, con `examples/index.json`).
- `.claude/launch.json` avvia una copia della demo sulla porta 4300, dell'editor sulla 4301 e delle due app in modalità registro sulla 4302 e 4303 (per l'anteprima nel pannello di Claude).
- Registro locale senza Keycloak: `java -jar reference/registry/target/lowcode-registry-0.1.0-SNAPSHOT.jar --spring.profiles.active=senza-auth`, poi `npm run publish:examples`, poi `npm run start:runtime:registro` / `start:editor:registro`.
- `runtime-config.json` (cartella pubblica del runtime) decide da dove vengono le definizioni: `examples` (demo) o `registry` (app, ambiente, navigazione, temi); la configurazione `registro` di angular.json usa `projects/runtime/config/registro/`. Con `services: { source: 'bff', appId }` il runtime usa le porte vere di `services` (configurazione `bff`, `projects/runtime/config/bff/`).
- **Stack completo con Keycloak passo per passo** (Docker Desktop avviato): `cd idp && docker compose up -d`; in `reference/` `mvn -q package -DskipTests` e `java -jar <modulo>/target/*.jar` per registry (con `--lowcode.registry.storage-dir=<cartella>` per non perdere i dati), authz, telemetry, bff; in `frontend/` `npm run demo-api` (8084), `npm run publish:examples -- --user amministratore --password amministratore`, poi `npm run start:runtime:bff` (4200) e `start:editor:bff` (4201). Le origini ammesse dal BFF sono 4200 e 4201.
- test per progetto: `npx ng test <schema|expressions|core|components|services|runtime|editor> --watch=false`

Stato test (tutti verdi): schema 71, expressions 42, core 80, components 181, services 27, runtime 84, editor 110 (**595**); Java 39 (authz 7, bff 8, registry 18, telemetry 6); Playwright 18 (di cui 12 di accessibilità e 2 sull'editor di testo formattato); kit di conformità: registro 17/17, autorizzazioni 11/11, telemetria 6/6. Build di produzione: runtime 2,46 MB iniziali (422 kB trasferiti), editor 818 kB iniziali (l'anteprima e l'editor si caricano a parte).

## 4. Architettura in breve

Librerie (`frontend/projects/`): `schema` (JSON Schema + tipi), `expressions` (CEL, template `{{ }}`, formattatore messaggi), `core` (ScreenRuntime, motore delle azioni, NavigationRuntime, I18n, porte astratte, catalogo, tema), `components` (NG-ZORRO), `services` (porte reali: HTTP/BFF/OIDC). App: `runtime` (demo/shell), `editor` (editor visuale, vedi § 5b).

- Porte (classi astratte come token DI): Authorization, UserProvider, DataClient (con `{ signal }` per annullare le letture superate), ScreenNavigator, Notifier, RuntimeDiagnostics, Confirmation, **FormDialog** (passo `dialog`), DefinitionSource (schermate, navigazione, temi e **cataloghi** `messages(lingua)`).
- Nodi: section (anche `layout: "row"`), **box, grid, border** (contenitori di layout; i figli dichiarano `grow`, `span`, `region`; border con lati ridimensionabili), **input** (campo a sé legato allo stato, con `group` di validazione), text, **image, link**, button, filterBar, table, **dataTable**, **serverDataTable**, form, tabs, detail, alert, **stats, progress, timeline, kanban**, **wizard**, **tree**, **calendar**, **chart**. Passi: set, call, refresh, navigate, toast, confirm, **dialog, validate, print, export** (CSV).
- Marchio: il prodotto si chiama **KinetiX**, l'editor **KinetiX Studio** (`assets/brand/`, README del marchio). Logotipo `lc-kinetix-wordmark` (testo in Sora da `@fontsource/sora`, non gli SVG con `<text>`), nella barra laterale della demo con lo spazio `lcBrand` e in alto a sinistra nell'editor; favicon in entrambi. Gli identificativi tecnici (realm `lowcode`, pacchetti Java, prefissi `lc-`) restano.
- Campi: text, number, select, checkbox, date, **textarea, datetime, radio, switch, multiselect, lookup, file, repeater, richtext**. Formati: **number**, currency, percent, date, datetime, boolean, badge, markdown.
- Testo formattato: `format: markdown` su text, alert e campi del detail (Markdown ristretto: `core/src/lib/markdown.ts`, disegnato da `lc-markdown` senza HTML); editor `richtext` (`lc-rich-text-editor`, contenteditable + comandi del browser, valore in Markdown). Le etichette restano testo semplice di proposito. Catalogo § 2.26.
- Tabella: ordinamento (in pagina o lato server con `sort.bind`), selezione + azioni multiple, menu azioni (`rowActionsInline`), righe espandibili, celle cliccabili, riga dei totali (`aggregate`).
- `lc-node` applica `visibleIf/hiddenIf` e `tooltip`, ed espone `data-node-id`/`data-node-type` (per l'editor e i test). Permessi `dominio.risorsa.azione`; espressioni **fail-closed**.
- I data source GET si ricaricano **solo se cambia la richiesta risolta** (URL e parametri); `refresh` ricarica comunque. `ScreenRuntime.query` esegue un data source senza toccarne lo stato condiviso (usato dai lookup e dalla serverDataTable). `refresh` su un data source non GET incrementa solo `ScreenRuntime.refreshCount`, che la serverDataTable osserva per ricaricarsi.
- `DataRequest.file`: invio multipart dei file (`HttpDataClient` usa `FormData`), fino a 100 MB; il base64 nel JSON resta per file fino a 10 MB.
- Variabili sempre presenti nei data source: `search` e `lookupKey` (lookup), `request` (serverDataTable, contratto nel catalogo § 2.19), `file` nei data source di `upload`.
- Shell responsive a tre fasce (≥1200 espansa, 768–1199 compressa, <768 cassetto); pulsante tondo accanto al logo.

## 5. Catalogo componenti

`docs/catalogo-componenti.md`: specifica di ogni componente aggiunto (fino al § 2.25), regole comuni e **limiti noti** (§ 3); `docs/riferimento-schema.md`: tutte le proprietà, generate dallo schema. La vetrina della demo ha dodici schermate: Componenti base, Form, Attività e avanzamento, Contenitori di layout, Campi a sé, Campi e form, Filtri e tabelle, Tabelle avanzate, Datatable, Schede/dettaglio/messaggi, Cruscotto, Procedure e viste.

## 5b. KinetiX Studio (editor visuale)

`docs/editor.md` descrive tutto. In breve: tavolozza (clic o trascinamento), struttura (seleziona, sposta, duplica, taglia/incolla, trascina), pannello delle proprietà **generato da `screen.schema.json`** (elenchi di colonne/campi/azioni/passi modificabili elemento per elemento, passi per variante, oggetti come gruppi), anteprima con il runtime vero e porte finte (dati di esempio per data source, permessi, larghezze, parametri, registro; Alt+clic seleziona), vista JSON, pannello dei data source (rinomina con aggiornamento dei riferimenti), pannello dei testi (rendi traducibile, traduzioni it/en applicate all'anteprima, esportazione per i cataloghi), problemi (schema, CEL, id ripetuti, data source mancanti), cronologia di annullamento, bozza nel browser, apri esempio / importa / esporta. Un componente nuovo richiede solo il modello in `model/templates.ts`, il gruppo nella tavolozza e `ed.type.<tipo>` nei messaggi. Dal 13 ottobre: completamento delle espressioni mentre si scrive; componenti trascinati dalla tavolozza direttamente sull'anteprima; anteprima con **dati veri** (solo letture, editor dietro il BFF); pannello «Registro» con stato di revisione, Chiedi revisione/Approva/Respingi, Confronta (versione contro documento aperto), avviso di modifiche concorrenti (If-Match), errori di validazione del registro punto per punto; pannello «Testi» che salva e pubblica i cataloghi nel registro.

Modalità «Navigazione» (selettore nella barra): struttura di casi d'uso/gruppi/voci con «+ Caso d'uso / Gruppo / Voce», campi da `navigation.schema.json`, anteprima del menu vero con profilo simulato (permessi da spegnere), problemi (schema, id ripetuti tra fratelli, schermate non note, default inesistente). Modalità «Tema»: token dai campi dello schema dei temi (selettore per i colori), anteprima della schermata e del menu correnti con il tema. **Anteprime in iframe** (ADR-08): la stessa app con `?anteprima` (`PreviewApp`, `preview-config.ts`), messaggi definiti in `preview/protocol.ts` (stato → anteprima; pronto, selezione, eventi → editor), solo stessa origine e proprio iframe; lo stato arriva clonato e l'anteprima confronta per contenuto per non ridisegnare a ogni selezione. `DocumentState` è la base comune; `ed-fields` e la vista JSON lo iniettano, e l'editor della navigazione lo ridirige su `NavigationStore` con un provider.

## 6. Trappole note (NG-ZORRO / Angular / strumenti)

Le principali sono nella DEVELOPMENT-GUIDE (§ 4, 5, 6b, 9). In breve:

- Stringhe in modal, message e titoli dell'albero sono **HTML** → componenti di contenuto, `escapeHtml` o template propri.
- jsdom non ha `execCommand`: la barra dell'editor di testo formattato si prova solo in e2e. Nei testi di riserva di `t()` gli a capo si scrivono `\n` (CEL non ammette a capo veri tra apici).
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

- Runtime: in modalità `bff` usa `provideLowcodeServices` (sessione, autorizzazione, data client, telemetria) e `BffShellSession`; in demo le porte finte e `DemoShellSession`. La logica dei dati della demo sta in `runtime/src/demo/demo-backend.ts`, usata da `MockDataClient` e da `tools/demo-api.mjs`.
- BFF: rotte `/registry`, `/authz`, `/telemetry`, `/api`; CSRF per SPA; logout OIDC. Provato dal vivo il 13 ottobre 2026 (anche con `npm run stack`).
- Registro di riferimento (contratto 0.3): validazione con gli stessi JSON Schema del frontend (networknt), revisione a quattro occhi (ruoli `responsabile`, `amministratore`), ambienti protetti `collaudo` e `produzione`, If-Match, archivio su file opzionale, documenti `messages` per le traduzioni. Le espressioni CEL **non** si controllano lato server (le controllano editor e runtime).
- e2e solo in Chromium; il controllo automatico di accessibilità non sostituisce le prove a mano.
- Editor: sull'anteprima si aggiungono, spostano e ridimensionano (span, grow) i componenti; i lati del border si ridimensionano solo nel runtime; il confronto è tra una versione e il documento aperto, non tra due versioni.
- `validate:examples` non controlla le espressioni CEL (lo fa il test `i18n-examples.spec.ts`).
- Limiti dei componenti: catalogo § 3.
- Documenti Claude Docs (architettura `81cf6668-…` e gli altri): non aggiornati dopo l'11–12 ottobre; il dettaglio è nel repository.

## 8. Prossimi passi (nell'ordine suggerito)

1. Review del lavoro del 13 ottobre (commit da `64be1d5` in poi).
2. Kit di conformità in CI contro i servizi di riferimento (oggi si eseguono a mano, per esempio dopo `npm run stack`).
3. Editor: confronto tra due versioni del registro; larghezze dei lati del border dall'anteprima.
4. e2e in Firefox e WebKit.
5. CEL in `validate:examples` e, a regime, nel registro.
6. Aggiornare i documenti Claude Docs (architettura § 9, funzionale, linee guida) con lo stato di ottobre.

## 8b. Cosa manca e ottimizzazioni proposte (13 ottobre 2026)

Elenco redatto il 13 ottobre e **realizzato lo stesso giorno** (lavoro autonomo richiesto da Simone). Per ogni voce, dove sta:

| Voce | Stato |
| --- | --- |
| CI e prima suite e2e | fatto (sessione dedicata): `.github/workflows/ci.yml`, `frontend/e2e` |
| Controllo di accessibilità (axe) | fatto: `e2e/accessibilita.spec.ts` su 12 schermate; corretti contrasti, etichette, `nz-steps`, `nz-tree`, titoli dei gruppi del menu |
| Kit di conformità | fatto per registro (17/17), autorizzazioni (11/11) e telemetria (6/6); hanno trovato e fatto correggere differenze nei servizi di riferimento |
| Registro persistente, revisione, confronto, promozione, validazione al salvataggio | fatto: registro 0.3 (archivio su file, quattro occhi, ambienti protetti, If-Match, JSON Schema lato server); confronto nell'editor |
| Completamento delle espressioni, modifica diretta nell'anteprima, dati veri, modifiche concorrenti | fatto (sull'anteprima si aggiungono, spostano e ridimensionano i componenti) |
| Validazione a livello di schermata, CSV, stampa | fatto: passi `validate`, `export`, `print` |
| Immagine, link, avanzamento, timeline, kanban | fatto (`image`, `link`, `progress`, `timeline`, `kanban`); i tag colorati esistono già come formato `badge` |
| Border con divisori trascinabili | fatto (`resizable`) |
| Menu con tastiera, badge, ricerca | fatto, con i contatori anche sui gruppi chiusi |
| Cataloghi delle lingue da un servizio | fatto: documenti `messages` nel registro |
| CSP senza `unsafe-eval` | fatto: validatori precompilati (Ajv standalone) |
| Node fissato | fatto (`.nvmrc`, `engines`) |
| Ottimizzazione 2 (validare alla pubblicazione) | fatto (validazione nel registro + validatori precompilati); la cache HTTP `immutable` delle versioni non è stata aggiunta |
| Ottimizzazione 3 (caricamento differito) | fatto in parte: editor e anteprima separati; il runtime resta in un bundle (NG-ZORRO serve quasi tutto alla prima schermata) |
| Ottimizzazioni 4, 5, 6, 7 | fatte: annullamento e unione delle richieste, cache CEL, `npm run stack`, `filterBar` su `lc-field-control` e `schema:docs` |

## 9. Convenzioni di lavoro

- Commit in italiano, descrittivi, uno per componente, a nome dell'utente: nessun trailer `Co-Authored-By` di Claude (la storia è stata ripulita il 14-10-2026).
- Dopo ogni modifica al codice: `build:libs`, test dei progetti toccati, `validate:examples` se si toccano esempi o schemi; per la UI controllo nel browser (demo sulla 4300).
- Gli schemi JSON sono la fonte: modificare `*.schema.json`, poi `schema:sync`, poi i tipi in `schema/src/lib/types.ts`.
- Ogni componente nuovo: schema, tipo, componente registrato in `STANDARD_COMPONENTS`, test (schema in `schema/new-components.spec.ts`, componente in `components/*.spec.ts` con `renderScreen`, vetrina in `runtime/vetrina-avanzata.spec.ts` con `openShowcase`), esempio in `examples/vetrina-*.json` con testi in `examples/i18n/it.json` ed `en.json`.
- Mai colori scritti a mano nei componenti: `var(--lc-*)` o token NG-ZORRO. Mai testo utente nei componenti: `runtime().text(...)` o chiavi `lc.*` in `messages.ts` (it ed en).
- Sicurezza (non negoziabile): niente HTML da dati o traduzioni, espressioni fail-closed, nessun valore di dato nelle diagnostiche, l'enforcement vero sta nel backend.

## 10. Riferimenti

- `README.md`, `DEVELOPMENT-GUIDE.md` (inglese), `docs/README.md`, `docs/catalogo-componenti.md` (italiano).
- Documenti Claude Docs: architettura `81cf6668-1f89-4814-aa01-06ef8b99ee8d`, funzionale `d3763c98-122d-4331-b9c4-2c4f18cffd1c`, linee guida `f286ccf2-9ad4-4470-8f34-da217be64031`, panoramica testi/i18n `b7da8557-c708-422d-be72-d1829a0b03e7`.
- Cronologia recente: `b3d7a5d` editor: trascinamento, `221ae42` suggerimenti, `ab5057a` anteprima collegata, `8d7e462` elenchi campo per campo, `5840c9c` prima versione dell'editor; `9bae9b7` serverDataTable; `f42abdf` grafici impilati e doppio asse, `4a8379c` datatable per grandi volumi, `e783fbb` albero da tastiera, `b130599` lookup e file nelle righe, `62fe0ee` file in multipart, `7907884` testo dei valori nel lookup; `47a96ee` datatable … `2b51e38` ordinamento, `4d224fb` catalogo; `9d96798` fix ricaricamento data source; `85d0409` guscio responsive; `5230022` i18n completo.
