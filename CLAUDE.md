# KinetiX: regole del progetto

KinetiX è una piattaforma low-code per frontend gestionali definiti da JSON (schermate, data source, azioni, espressioni CEL), con il runtime Angular, l'editor visuale **KinetiX Studio** e servizi di base descritti da contratti OpenAPI. Cosa fa il progetto: [README.md](README.md). Come si lavora nel dettaglio: [DEVELOPMENT-GUIDE.md](DEVELOPMENT-GUIDE.md). Stato e prossimi passi: [HANDOFF.md](HANDOFF.md).

Questo file raccoglie le regole da rispettare sempre. Dove la guida di sviluppo entra nel dettaglio, qui c'è solo il rimando.

## 1. Modo di lavorare

- **Si fa quello che è stato chiesto.** Una modifica non richiesta (un refactoring, una dipendenza nuova, un cambio di comportamento) si propone e si aspetta l'approvazione. I problemi trovati per strada si segnalano a parte, non si correggono di nascosto.
- **Revisione architetturale.** Incongruenze, punti mancanti e insufficienze rispetto ai requisiti si segnalano esplicitamente, anche quando non sono l'oggetto del lavoro.
- **Prima si guarda il codice.** Comportamenti, valori predefiniti e nomi si verificano nei sorgenti prima di scriverne (nel codice, nei documenti, nelle descrizioni dello schema).
- **Soluzioni leggere e governabili.** Stack aggiornato, DSL ed espressioni semplici; niente motori di regole pesanti né framework in più per problemi piccoli.
- **Un'attività, un commit, un push.** Nel lavoro lungo: un commit per componente, con test e controllo visivo prima di passare al successivo.
- **Esiti riportati fedelmente.** Se un test fallisce o un controllo è stato saltato, lo si dice.

## 2. Lingue

| Cosa | Lingua |
| --- | --- |
| Codice, identificatori | inglese |
| Commenti nel codice | come quelli del file (oggi per lo più italiano) |
| `README.md`, `DEVELOPMENT-GUIDE.md` | inglese |
| `HANDOFF.md`, `docs/`, descrizioni degli schemi JSON | italiano (termini tecnici in inglese) |
| Testi della demo e degli esempi | italiano e inglese (`examples/i18n/it.json`, `en.json`) |
| Diagnostiche per sviluppatori (schema, espressioni, `services`) | italiano, non tradotte |
| Messaggi di commit | italiano |

I documenti spiegano in modo semplice, con figure ed esempi pratici. I contenuti nuovi vanno nelle sezioni pertinenti, non in paragrafi di confronto isolati.

## 3. Commit e storia

- Conventional Commits in italiano, con un ambito quando aiuta: `feat(editor): …`, `fix(tabelle): …`, `docs(schema): …`. Il corpo spiega cosa cambia e perché.
- I commit sono a nome dell'autore del repository e basta: **nessun trailer** (`Co-Authored-By`, `Signed-off-by` automatici, identificativi di sessione), né riferimenti a strumenti usati per scrivere codice o testi nei commit, nei commenti, nei documenti o nelle pull request.
- I file generati si committano insieme alla loro fonte (`*.schema.json` con `*.schema.ts`, `validators.generated.ts` e `docs/riferimento-schema.md`).
- Test e documentazione aggiornati nello stesso commit della modifica.
- Mai `push --force`, riscritture della storia o `reset --hard` su `main` senza conferma esplicita. Prima di riscrivere, `git fetch` e controllo che nessun altro abbia spinto nel frattempo.
- Mai committare segreti, token, file `.env`, dati personali, `dist/`, `data/`, `.stack/`.

## 4. Ambiente e comandi

- Node 24 (`.nvmrc`). Se la shell ha un'altra versione: `eval "$(fnm env --shell bash)"; fnm use 24.21.0`. JDK 21 e Maven 3.9 solo per `reference/`; Docker solo per Keycloak in `idp/`.
- Si lavora da `frontend/`. **`npm run build:libs` prima di provare o testare le app**: i path di `tsconfig` puntano a `./dist/*`, e un `dist` vecchio dà errori fuorvianti. Dopo `build:libs` si riavviano i dev server.
- Test di un progetto: `npx ng test <schema|expressions|core|components|services|runtime|editor> --watch=false`. Gli spec del runtime vogliono prima `npm run demo:prepare`.
- I comandi lunghi (build, suite di test, `npm run stack`) si lanciano in background.
- Tabella completa dei comandi: DEVELOPMENT-GUIDE § 3.

### Prima di considerare finito un lavoro

Si eseguono i controlli toccati dalla modifica, e tutti prima di una pull request:

1. `npm run schema:check` e `npm run schema:docs:check` (se è cambiato uno schema: prima `schema:sync` e `schema:docs`);
2. `npm run validate:examples`;
3. `npm run build:libs`;
4. test dei progetti toccati (prima di una PR: `npm run test:libs` più runtime ed editor);
5. per la UI: controllo nel browser sulla demo (porta 4300, `.claude/launch.json`) e, se serve, `npm run e2e`;
6. per `reference/`: `mvn verify`.

La CI (`.github/workflows/ci.yml`) ripete gli stessi controlli: deve restare verde.

## 5. Architettura: confini da non violare

- Dipendenze solo verso il basso, mai cicli: `runtime → components → core → expressions / schema`, `runtime → services → core`, `editor → components → core`.
- `core` non contiene codice NG-ZORRO (tranne avviso e tipografia del guscio della schermata); tutto ciò che usa NG-ZORRO sta in `components`.
- Tutto ciò che è esterno all'interprete è una **porta** (classe astratta come token DI). I componenti dipendono dall'astrazione; la demo ha implementazioni finte, `services` quelle vere.
- Le librerie non sanno nulla delle applicazioni: niente casi d'uso o domini incorporati.
- **Contract first.** Si cambia `contracts/*.yaml`, lo si valida, poi il codice. Le modifiche incompatibili vogliono una nuova versione del percorso.
- L'implementazione di riferimento (`reference/`) non è per la produzione: resta semplice e dichiarata come tale.
- Le decisioni di architettura si registrano come ADR.

## 6. Schemi JSON

- Gli schemi `*.schema.json` sono l'unica fonte. Dopo ogni modifica: `npm run schema:sync`, i tipi in `schema/src/lib/types.ts`, `npm run schema:docs`. I `*.schema.ts` e `validators.generated.ts` non si modificano a mano.
- **Ogni proprietà ha una `description`** breve e corretta in italiano: compare nel pannello delle proprietà dell'editor, nell'«Aiuto» della vetrina e nel riferimento generato. Accanto a un `$ref` la descrizione sta nello stesso oggetto. Indicare il valore predefinito quando c'è («(3 se assente)»).
- Nelle descrizioni niente `<…>` letterali: diventano HTML nel riferimento Markdown.
- Ajv in modalità strict: `type: object` accanto a `properties`; una proprietà in un `required` dentro `if/then` o `anyOf` va dichiarata anche lì. Nodi chiusi con `additionalProperties: false` o `unevaluatedProperties: false`.
- Le espressioni regolari si scrivono da un file di script, non da un heredoc della shell (le doppie barre rovesciate si perdono).

## 7. Componenti

Il percorso completo per un componente nuovo è nella DEVELOPMENT-GUIDE § 4. In sintesi: schema e tipo, componente standalone `OnPush` con `input()`, registrazione in `STANDARD_COMPONENTS`, test, esempio nella vetrina con i testi in `it.json` ed `en.json`, modello e tavolozza nell'editor con `ed.type.<tipo>`, catalogo in `docs/catalogo-componenti.md`.

- Le espressioni si risolvono solo attraverso il runtime della schermata (`runtime().text(...)`, `isVisible`, `isEnabled`); mai valutare stringhe da sé.
- La logica sui dati sta in funzioni pure testabili senza disegnare (come `table-data.ts`, `chart-geometry.ts`).
- Un componente che scrive nello stato (`bind`) gli dà un valore iniziale in `ScreenRuntime.seedFilters`.
- Un componente che legge un data source usa `<lc-busy>` per l'attesa; niente indicatori propri, niente «nessun risultato» durante il caricamento.
- I campi singoli si disegnano in `lc-field-control`, condiviso da `form`, `input` e `filterBar`: un tipo di campo nuovo va lì una volta.
- Il pannello delle proprietà dell'editor si genera dallo schema: nessun form scritto a mano per un componente.
- Le trappole note di NG-ZORRO (stringhe HTML in modal e message, icone da registrare, array e date in `ngModel`, `nzScroll`, `[readonly]`, ecc.) sono nella DEVELOPMENT-GUIDE § 5 e nel HANDOFF § 6: leggerle prima di toccare un componente.

## 8. Testi, lingue e tema

- Mai testo per l'utente scritto in un componente. I testi del JSON passano da `runtime().text(value, scope)`; quelli della piattaforma da `inject(I18n).t('lc.…')` con la chiave in `components/src/lib/messages.ts`, in italiano **e** inglese.
- Il risultato di una traduzione è sempre testo semplice.
- Mai colori scritti a mano: `var(--lc-*)` o i token NG-ZORRO. Unica eccezione i colori del marchio (`assets/brand/`), che non seguono il tema.

## 9. Sicurezza (non negoziabile)

- Niente HTML dai dati, dalle traduzioni o dal JSON: niente `innerHTML`, `bypassSecurityTrust*`, `eval`, `new Function`. Il testo formattato passa da `parseMarkdown` e `lc-markdown`; il dialetto Markdown non accetta HTML.
- Stringhe dinamiche verso `NzModalService` / `NzMessageService` solo attraverso un componente di contenuto o `escapeHtml`.
- Nessun segreto, token o dato personale in JSON, log, URL, diagnostiche o storage del browser. I token restano nel BFF.
- Gli URL dei data source sono relativi alla stessa origine: il browser parla solo con il BFF, che aggiunge il token dell'utente e protegge le scritture con CSRF.
- Espressioni **fail-closed**: un errore non concede, non mostra e non abilita; finisce in `RuntimeDiagnostics`, mai in un'eccezione durante il disegno.
- Permessi nel formato `dominio.risorsa.azione`. Il frontend non è un confine di autorizzazione: ogni regola vale anche nel backend.

## 10. Test

- Uno `*.spec.ts` accanto all'unità; si descrive il comportamento, non l'implementazione.
- I test che disegnano componenti NG-ZORRO usano `provideLowcodeComponents()`; le schermate si provano con `renderScreen` (`components`) o `openShowcase` (`runtime`).
- `settle(fixture)` e le asserzioni con attesa automatica, mai timeout fissi.
- I test della vetrina verificano che le diagnostiche restino vuote: un errore di espressione in un esempio è un bug.
- Ciò che jsdom non vede (layout, overlay veri, focus) si prova con Playwright in `frontend/e2e/`, con localizzatori accessibili (`getByLabel`, `getByRole`).
- I test non confrontano testi che cambiano spesso (descrizioni dello schema, documentazione): si confrontano struttura e comportamento.
- Un bug corretto porta con sé un test che lo avrebbe trovato.

## 11. Qualità del codice

- TypeScript strict; niente `any` senza un commento che lo giustifichi; `readonly`, signals e `computed`.
- Componenti standalone, `OnPush`, `input()` / `output()`, nuovo control flow (`@if`, `@for`).
- Accessibilità: landmark ed etichette, tutto usabile da tastiera, nessun significato affidato al solo colore.
- Il codice nuovo somiglia a quello intorno: stessi nomi, stessa densità di commenti, stessi idiomi. Niente codice morto, niente astrazioni anticipate.
- Formato da `.editorconfig`: UTF-8, LF, due spazi (quattro in Java), a capo finale.
- Le dipendenze nuove si propongono prima di aggiungerle.

## 12. Documentazione

- Una modifica visibile aggiorna i documenti nello stesso commit: catalogo dei componenti, `docs/editor.md`, README o guida di sviluppo secondo il caso.
- `HANDOFF.md` si aggiorna alla fine di un blocco di lavoro: stato dei test, limiti noti, prossimi passi.
- `docs/riferimento-schema.md` non si scrive a mano: si genera con `npm run schema:docs`.
