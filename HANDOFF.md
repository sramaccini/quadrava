# HANDOFF — Piattaforma LowCode

Documento di passaggio per continuare il lavoro con Claude Code in locale. Ultimo aggiornamento: 2026-10-09, commit `5230022`. Il working tree era pulito dopo quel commit (questo file è nuovo e non committato).

## 1. Cos'è

Piattaforma low-code per frontend gestionali/amministrativi **definiti da JSON** (schermate, data source, azioni, espressioni CEL), più un editor visuale (NON iniziato) e servizi di base. Il backend consiste in contratti OpenAPI e un'implementazione di riferimento Spring Boot non destinata alla produzione (moduli Java mai compilati).

## 2. Preferenze di Simone (rispettale)

- **Chiedi approvazione prima di fare modifiche** non richieste esplicitamente; in dubbio, proponi e aspetta.
- Modalità **architectural review**: segnala incongruenze, punti mancanti, insufficienze rispetto ai requisiti.
- Documenti **in italiano** (termini tecnici in inglese), con figure ed esempi pratici spiegati semplicemente; contenuti integrati nelle sezioni pertinenti, non paragrafi di confronto isolati.
- Stack più recente; soluzioni DSL/espressioni leggere e governabili (no rule engine pesanti).
- README e DEVELOPMENT-GUIDE sono in **inglese**; `docs/README.md` e i documenti di progetto in italiano.

## 3. Stack e comandi

Angular 22.2 (standalone, signals, OnPush), TypeScript 6.0, Node 22.22.3+ o 24, test con vitest via `ng test` (jsdom), Ajv 8, cel-js 8, ng-zorro-antd 22.1.1, Spring Boot 4.1.1, Keycloak 26.8.

Da `frontend/`:

- `npm ci` (obbligatorio dopo ogni pull che cambia le dipendenze)
- `npm run build:libs` — **prima** di build e test delle app: i path di tsconfig puntano a `./dist/*`
- `npm run schema:sync` — rigenera i `*.schema.ts` dagli schemi JSON (`tools/sync-schema.mjs`)
- `npm run validate:examples` — valida gli esempi (schema + chiavi di traduzione)
- `npm run demo:prepare` / `npm run start:runtime` — copia `examples/` in `projects/runtime/public/examples` (gitignored) e avvia la demo
- test per progetto: `npx ng test <schema|expressions|core|components|services|runtime> --watch=false`

Stato test (tutti verdi): schema 25, expressions 39, core 55, components 60, services 18, runtime 40.

## 4. Architettura in breve

Librerie (`frontend/projects/`): `schema` (JSON Schema + tipi), `expressions` (CEL, template `{{ }}`, formattatore messaggi), `core` (ScreenRuntime, NavigationRuntime, I18n, porte astratte, catalogo componenti, tema), `components` (NG-ZORRO), `services` (porte reali: HTTP/BFF/OIDC). App: `runtime` (demo/shell), `editor` (stub).

- Porte (classi astratte come token DI): Authorization, UserProvider, DataClient, ScreenNavigator, Notifier, RuntimeDiagnostics, Confirmation. I componenti dipendono solo dall'astrazione.
- Nodi: section, text, button, filterBar, table, form, tabs, detail, alert. Step: set, call, refresh, navigate, toast, confirm.
- `lc-node` (core/node-host) applica in modo centralizzato `visibleIf/hiddenIf` e il `tooltip`.
- Permessi `dominio.risorsa.azione`; espressioni **fail-closed**.
- Tema: `tokens.layout` (sider/header/pageHeader/content) → variabili `--lc-*`; `theme-bridge.ts` mappa i colori su `--ant-*`. Temi: chiaro, classico, scuro.
- Shell stile Ant Design Pro: sidebar (logo, select casi d'uso o icona a dropdown se compressa, nz-menu, toggle rotondo), header con user menu (logout sempre ultimo), page header con breadcrumb.

## 5. Testi, tooltip e i18n (lavoro più recente)

- `tooltip` opzionale su ogni nodo, azione, campo (icona di aiuto) e colonna; solo testo, mai HTML, accetta `{{ }}`.
- Servizio `I18n` (core): lingua attiva (`it`, `en`), due strati di messaggi (applicazione vince su integrati `lc.*`), ricerca: lingua attiva → predefinita → ripiego nel JSON → chiave. Reattivo (signals): cambiare lingua aggiorna tutto senza ricaricare.
- Funzioni CEL (in `expressions`): `t(chiave[, ripiego[, params]])`, `fmtCurrency`, `fmtNumber`, `fmtDate`, `plural`. Nomi **piatti** perché cel-js non accetta funzioni con namespace. Mappe con valori di tipo misto richiedono `dyn(...)` sui letterali. `user.locale` espone la lingua.
- Messaggi in ICU semplificato (`{n}`, `plural`, `select`, `\{`); `formatMessage` non lancia mai e restituisce solo testo.
- `valueKey` (colonna) e `optionKey` (campo) traducono valori/opzioni lasciando intatto il valore; i colori dei badge restano legati al valore originale.
- Cataloghi demo: `examples/i18n/it.json` e `en.json` (178 chiavi, devono coincidere); `loadMessages()` li carica; la demo ricorda la lingua (`localStorage`, chiave `lc.language`) e parte dalla lingua del browser. I test del runtime fissano `lc.language=it` perché jsdom dichiara `en-US`.
- Scritte della piattaforma in `components/src/lib/messages.ts` (chiavi `lc.*`, it + en). Locale NG-ZORRO segue la lingua (`provide.ts`).
- Non tradotti per scelta: diagnostiche per sviluppatori (errori schema/espressioni, caricamento menu, messaggi `services`) e dati finti della demo.
- Per aggiungere una lingua: `examples/i18n/<codice>.json` con le stesse chiavi di `it.json`, voce in `LANGUAGES` (app.ts), blocco in `messages.ts`, locale NG-ZORRO in `provide.ts`.
- Opzioni valutate e motivazione delle scelte (A2 + B3): documento Claude Docs «Testi dinamici e i18n: panoramica delle opzioni» (https://claude.ai/code/artifact/b7da8557-c708-422d-be72-d1829a0b03e7).

## 6. Trappole note (NG-ZORRO / Angular)

- Stringhe in modal e message sono **HTML** → usare `ConfirmMessageComponent` e `escapeHtml` (`NzNotifier`).
- Le icone vanno registrate (`ICON_TYPES` in `icon.component.ts`); il modulo tooltip è `NzTooltipModule`, dropdown `NzDropdownModule`, breadcrumb `NzBreadCrumbModule`.
- `nz-dropdown` di default è hover → `nzTrigger="click"`. `nz-layout` senza `nz-sider` impila in colonna → `flex-direction: row` esplicito.
- Nei test `nz-select` in jsdom richiede `stubViewportHeight`/`openSelect` (`select-testing.ts`).
- Il paginatore va fuori dal wrapper con `overflow-x: auto`. Il menu è sovrascritto con `::ng-deep` e variabili `--lc-sider-*`; il sottomenu è `div.ant-menu-sub`.
- `@ant-design/colors` `generate` su basi scure dà tinte sporche: nei temi chiari si mescola con il bianco.
- Nei test, un import chiamato `it` oscura la funzione `it` di vitest: rinominare gli import dei cataloghi.
- Ajv richiede `unsafe-eval` finché i validatori non sono precompilati.

## 7. Limiti noti / debito

- `services` **non è collegato** a `runtime` (la demo usa porte finte).
- BFF: mancano CSRF, forwarding delle API (con token e `traceparent`), allow-list degli host.
- Moduli Java mai compilati (`mvn verify` in sospeso; nomi starter Spring Boot 4 da verificare).
- `validate:examples` non controlla le espressioni CEL (lo fa però il test `i18n-examples.spec.ts` del runtime).
- Il pulsante di compressione, da menu compresso, si sovrappone leggermente al titolo della barra superiore (chiesto a Simone se spostarlo, nessuna risposta).
- Il catalogo componenti (documento Claude Docs) non è aggiornato per sidebar e user menu.
- Tooltip non implementato nelle schede di dettaglio; il tooltip sui pulsanti disabilitati non è stato provato.

## 8. Prossimi passi (nell'ordine suggerito)

1. Collegare `services` a `runtime` e completare il BFF (CSRF, forwarding, allow-list).
2. **Editor visuale** (`projects/editor`): albero dei nodi, pannello proprietà, anteprima, temi e menu. Con l'i18n: campo testo con scelta chiave dal catalogo, anteprima per lingua, elenco chiavi mancanti.
3. Componenti da costruire: ordinamento, selezione, righe di dettaglio, dialog con form, menu azioni di riga, righe ripetibili, viste ad albero e calendario.
4. Menu: navigazione da tastiera, badge, ricerca. CEL in `validate:examples`.
5. Facoltativi: cataloghi i18n da servizio (opzione B4), proprietà non testuali dinamiche (A4).

## 9. Convenzioni di lavoro

- Commit in italiano, descrittivi. Trailer:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_012eUDvJpLnKuXdrVNfcYTtc`
- Dopo ogni modifica al codice: `build:libs`, test del progetto toccato, `validate:examples` se si toccano esempi o schemi.
- Gli schemi JSON sono la fonte: modificare `*.schema.json`, poi `schema:sync`, poi i tipi in `schema/src/lib/types.ts`.
- Mai colori scritti a mano nei componenti: usare `var(--lc-*)` o i token NG-ZORRO.
- Mai testo utente scritto nei componenti: testi dal JSON via `runtime().text(valore, scope)`, scritte della piattaforma via `inject(I18n).t('lc.…')` con chiave in `messages.ts` (it ed en).
- Sicurezza (non negoziabile): niente HTML da dati o traduzioni, espressioni fail-closed, nessun valore di dato nelle diagnostiche, l'enforcement vero sta nel backend.

## 10. Riferimenti

- `README.md`, `DEVELOPMENT-GUIDE.md` (inglese), `docs/README.md` (italiano).
- Documenti Claude Docs: architettura `81cf6668-1f89-4814-aa01-06ef8b99ee8d`, funzionale `d3763c98-122d-4331-b9c4-2c4f18cffd1c`, linee guida `f286ccf2-9ad4-4470-8f34-da217be64031`, panoramica testi/i18n `b7da8557-c708-422d-be72-d1829a0b03e7`.
- Cronologia recente: `5230022` i18n completo, `8faf163` i18n base, `b0e7c91` tooltip, `4d74ec2` icona unica sezioni, `42c91f6` menu casi d'uso compresso, `f901782` logo/toggle/user menu, `8e203f0` layout da tema e page header.
