# Piattaforma LowCode — Linee guida di implementazione

Simone Ramaccini · 7 ottobre 2026

## 1. Scopo e destinatari

Queste linee guida spiegano **come** costruire la piattaforma in modo coerente con il documento funzionale e con quello di architettura. Servono a chi scrive codice e a chi scrive applicazioni in JSON. Le regole usano "deve" per ciò che non si può violare e "dovrebbe" per le buone pratiche con eccezioni motivate.

| Destinatario | Sezioni principali |
| --- | --- |
| Chi sviluppa runtime, editor, BFF, registry | 2, 3, 4, 7, 8, 9, 10, 11, 12 |
| Chi aggiunge componenti al catalogo | 6, 8, 9, 10, 11 |
| Chi scrive applicazioni in JSON | 5, 8, 9 |
| Chi fa revisione del codice | 13 |

## 2. Stack e versioni di riferimento

Si usano le versioni correnti stabili di ogni componente; le versioni esatte sono fissate nel repository e aggiornate con un processo regolare. Le voci marcate "da confermare" dipendono da decisioni ancora aperte.

| Area | Scelta | Note |
| --- | --- | --- |
| Frontend (runtime ed editor) | Angular 22.2.1 (ultima versione), componenti standalone, signals, TypeScript 6.0.x in modalità strict | Nessun modulo NgModule per codice nuovo. TypeScript 7 non è usabile: Angular 22.2 dichiara compatibilità con la 6.0 |
| Libreria grafica | NG-ZORRO 22.x (Ant Design per Angular), con Angular CDK e date-fns | Per tutti i componenti standard (ADR-11). Compatibile con Angular 22; il tema della piattaforma arriva alle sue variabili --ant-\* tramite il ponte provideLowcodeComponents. Lingua italiana e adattatore delle date inclusi |
| Validazione degli schemi | JSON Schema con Ajv | Lo stesso schema serve editor, registry e runtime |
| Editor di testo JSON | Monaco con schema associato | Suggerimenti e errori in tempo reale |
| Espressioni | CEL | Confermato: cel-js 8, dopo la prova di fattibilità (architettura, sezione 5) |
| Telemetria | OpenTelemetry per JavaScript, esportazione OTLP/HTTP | Verso l'endpoint di ingestione |
| Identità | OIDC con Authorization Code e PKCE; Keycloak 26.8.0 (ultima versione) | Nessuna logica specifica del provider |
| Reference implementation (BFF, registry, authz, ingestione) | Spring Boot 4.1.1 su Java 21, Maven multi-modulo, Spring Security come client OAuth2 e resource server | Scelta confermata |
| Test end-to-end | Playwright | Eseguito sulle applicazioni di esempio |
| Qualità del codice | ESLint e Prettier con regole della piattaforma | Le regole di sicurezza (sezione 10) sono bloccanti |
| Organizzazione del repository | Monorepo con strumento di build incrementale (per esempio Nx) | Da confermare |

## 3. Struttura del repository

La struttura rende visibili i confini dell'architettura: il frontend in `frontend`, i contratti in `contracts`, la reference implementation in `reference`.

```text
/frontend         workspace Angular (progetti in /frontend/projects)
  /projects
    /runtime      applicazione che interpreta il JSON
    /editor       editor visuale
    /schema       JSON Schema di schermate, temi e navigazione; tipi generati
    /core         interprete, stato, motore di azioni
    /expressions  valutatore di espressioni isolato
    /services     autenticazione, autorizzazione, telemetria, client HTTP
    /components   catalogo: una cartella per ogni componente
  /tools          script di validazione degli esempi
/contracts        specifiche OpenAPI: authz, telemetria, registry
/reference        reference implementation Spring Boot (non per produzione)
  /bff            sessione OIDC, token solo lato server
  /registry       registro delle applicazioni
  /authz          servizio di autorizzazione di esempio
  /telemetry      endpoint di ingestione di esempio
/idp              Keycloak per lo sviluppo locale
/examples         applicazioni JSON di riferimento, usate nei test
/docs             documentazione e decisioni architetturali
```

**Regole di dipendenza.** Le dipendenze vanno in una sola direzione: `components` dipende da `core`, `core` da `schema` e `expressions`. Nessuna libreria dipende da un'applicazione. Questa regola è imposta da un controllo automatico nella pipeline, non affidata alla revisione.

**I contratti sono la fonte.** I tipi dei client e dei server per authz, telemetria e registry sono generati dalle specifiche OpenAPI in `contracts`, mai scritti a mano.

**La reference implementation non è un servizio di produzione.** Il confine del prodotto, lato backend, è l'interfaccia REST più questa implementazione di riferimento. Deve superare gli stessi test di conformità che un backend del cliente deve superare, e non è pensata per carichi o requisiti di sicurezza di produzione.

## 4. Convenzioni di codice e di nomi

| Ambito | Convenzione |
| --- | --- |
| Chiavi JSON | camelCase (per esempio `visibleIf`, `dataSources`) |
| Tipi di componente | camelCase (per esempio `filterBar`, `table`) |
| Identificativi di schermata | kebab-case (per esempio `ordini-elenco`) |
| Permessi | `dominio.risorsa.azione` in minuscolo (per esempio `ordini.iban.scrivi`) |
| TypeScript | Modalità strict; `any` vietato; errori come tipi espliciti, non stringhe |
| Angular | Componenti standalone con `OnPush`; stato con signals; nessuna logica di business nei template |
| Commit | Conventional Commits; un commit, un cambiamento logico |
| Branch e revisione | Revisione obbligatoria; i cambi allo schema o ai contratti richiedono un revisore della piattaforma |

**Gli identificativi sono per sempre.** Un `id` di schermata, componente o azione, una volta pubblicato, non cambia: telemetria, test e commenti vi sono agganciati. Rinominare significa migrare.

## 5. Scrivere un'applicazione in JSON: regole di authoring

Un'applicazione ben scritta si legge come un indice: schermate con nomi chiari, dati dichiarati in alto, logica semplice. Le regole sotto servono a mantenerla governabile.

| Preferire | Evitare | Perché |
| --- | --- | --- |
| `can('ordini.ordine.approva')` | Controllare ruoli a mano, per esempio `user.roles` contiene 'admin' | I ruoli cambiano, i permessi sono il contratto con il backend |
| Espressioni brevi, su una riga | Espressioni lunghe con molte condizioni annidate | Se non si legge in un colpo d'occhio, la logica va nel backend o in un data source |
| `$ref` a un frammento comune | Copiare lo stesso blocco in più schermate | Una correzione, un solo punto |
| Chiavi di traduzione per i testi | Testi scritti direttamente nel JSON | Permette l'internazionalizzazione senza modificare la logica |
| `"sensitive": true` sui campi personali | Dimenticare la marcatura | Senza marcatura il valore potrebbe finire nei log |
| Un `onError` esplicito in ogni azione che modifica dati | Lasciare l'errore al comportamento di default | L'utente deve sapere cosa è successo e come proseguire |
| `id` stabili e parlanti | Identificativi generati a caso o riusati | Servono a telemetria, test e commenti |

**Mai segreti nel JSON.** Chiavi, password e token non compaiono mai nella definizione: solo riferimenti a configurazioni gestite dal BFF o dall'ambiente.

**Esempio.** Lo stesso pulsante scritto male e scritto bene:

```json
// Da evitare: ruolo scritto a mano, errore non gestito
{ "label": "Approva",
  "visibleIf": "{{user.roles.contains('admin')}}",
  "onClick": [ { "call": "approvaOrdine" } ] }

// Preferibile: permesso, stato corretto, errore gestito
{ "id": "btn-approva", "label": "@ordini.approva",
  "visibleIf": "{{can('ordini.ordine.approva') && row.stato == 'inviato'}}",
  "onClick": [ { "call": "approvaOrdine", "args": { "id": "{{row.id}}" },
                 "onError": { "toast": "@errori.approvazione" } } ] }
```

**Nomi dei permessi.** Sempre `dominio.risorsa.azione`, tre parti esatte in minuscolo e cifre (per esempio `ordini.ordine.approva`, `ordini.iban.leggi`). Lo schema rifiuta ogni altro formato. Nelle espressioni di riga o di form i permessi del singolo record si leggono come `row._perm.update` o `form._perm.update`.

**Temi.** Un componente non scrive mai un colore, un font o una misura fissa: usa solo le variabili `--lc-*` (`--lc-color-*`, `--lc-font-family`, `--lc-font-size`, `--lc-radius`, `--lc-gap`, `--lc-control-height`). Un nuovo aspetto si ottiene con un documento tema, non con CSS aggiuntivo. I componenti standard sono costruiti con NG-ZORRO: i loro colori (primario, successo, errore, chiaro o scuro) arrivano dal tema tramite il ponte della libreria components, quindi non si sovrascrivono le classi ant-\* con CSS proprio. Le variabili --lc-\* servono alle parti scritte in casa (guscio della schermata, menu laterale, intestazione di pagina, spaziature). Il guscio ha le proprie: --lc-sider-\*, --lc-header-\*, --lc-page-header-\* e --lc-content-padding, dichiarate nel gruppo layout del tema con ripieghi ricavati dai colori base; menu laterale e intestazione di pagina leggono solo quelle, e il tono (chiaro o scuro) del tema sceglie soltanto lo stile del menu della libreria. I valori di colore e font seguono i pattern dello schema, che impediscono l'iniezione di CSS.

**Menu e casi d'uso.** Il menu è un documento di navigazione, non codice: i casi d'uso sono aree funzionali con il proprio menu, fino a tre livelli. Si controllano i permessi con `requires` sulla voce (non con ruoli), `visibleIf` solo per condizioni di stato, e ogni `screen` deve esistere. Gli id di caso d'uso, gruppo e voce sono univoci; `default` indica un caso d'uso esistente.

## 6. Aggiungere un componente al catalogo

Un componente è completo solo quando ha schema, codice, test, esempio e documentazione. L'ordine sotto evita di scoprire a fine lavoro che manca qualcosa.

1. **Definire lo schema.** Creare in `libs/schema` il JSON Schema del componente: proprietà, eventi, punti di inserimento. Da qui editor e validazione funzionano da soli.
2. **Scrivere il componente Angular.** Standalone, `OnPush`, con ingressi derivati dallo schema; costruito con i componenti di NG-ZORRO importati un modulo per volta (per esempio NzTableModule), non con elementi nativi stilizzati a mano; nessuna chiamata HTTP diretta.
3. **Collegare i permessi.** Supportare `hiddenIf`, `readOnlyIf` e `enabledIf` usando la direttiva comune della piattaforma, non una logica propria.
4. **Collegare la telemetria.** Emettere eventi solo tramite il servizio di telemetria; non scrivere mai nei log valori dei dati.
5. **Garantire l'accessibilità.** Navigazione da tastiera, etichette, contrasto e annunci per tecnologie assistive secondo WCAG 2.2 livello AA.
6. **Registrare il componente.** Un'unica chiamata di registrazione, vedi sotto.
7. **Scrivere i test.** Test del componente, test di contratto tra schema e componente, e un caso nelle applicazioni di esempio.
8. **Aggiungere un esempio e la documentazione.** Un frammento JSON commentato in `examples`.
9. **Chiedere la revisione.** Obbligatoria da parte di un revisore della piattaforma.

```ts
registerComponent({
  type: 'filterBar',
  schema: filterBarSchema,        // JSON Schema del componente
  component: FilterBarComponent,  // componente Angular standalone
  since: '1.0'                    // versione dello schema in cui compare
});
```

**Componenti personalizzati dei team applicativi.** Seguono lo stesso percorso; in più devono essere registrati dalla piattaforma tramite revisione, non caricati da un indirizzo scelto dall'autore dell'app.

**Contratto di un componente.** Ogni componente del catalogo dichiara i tre input `node` (la definizione JSON), `runtime` (lo stato della schermata) e `scope` (variabili locali come `row` o `form`). La visibilità non si implementa nel componente: la applica `lc-node` (`visibleIf`, `hiddenIf`, `requires`), così ogni componente la eredita nello stesso modo. Per leggere permessi, dati o navigazione un componente usa le porte del core (`Authorization`, `DataClient`, `ScreenNavigator`), mai servizi concreti.

**Regole d'uso di NG-ZORRO.** Sono sette e nascono da problemi trovati nei test. Primo: si importano i singoli moduli (`ng-zorro-antd/table`, `ng-zorro-antd/select`...), mai un modulo che li raccoglie tutti. Secondo: ogni stringa passata a modali, messaggi, avvisi e suggerimenti dalla libreria è letta come HTML; un testo che contiene valori dei dati va quindi mostrato con un componente di contenuto che lo interpola (come fa `DialogConfirmation` con `ConfirmMessageComponent`) oppure reso innocuo prima (come fa `NzNotifier`), mai passato così com'è. Terzo: le icone si registrano una per una con `provideNzIcons` e il nome arriva solo dal set integrato (`ICON_TYPES`), perché un'icona non registrata verrebbe cercata in rete. Quarto: lingua e adattatore delle date si impostano una volta sola in `provideLowcodeComponents`, non nei singoli componenti. Quinto: un controllo con `ngModel` non riceve un oggetto nuovo a ogni rilevamento delle modifiche (per esempio una `Date` creata nel template), perché si riscrive di continuo; si calcola con un `computed`, e i form si dichiarano con `ngNoForm` per non agganciarli a un `NgForm` che non serve. Sesto: gli elenchi a tendina, le finestre e i messaggi vivono nello strato di sovrapposizione di CDK, fuori dal componente: nei test si cercano in `document.body` e si ripuliscono a fine prova. Settimo: in jsdom l'elenco delle opzioni di `nz-select` non si disegna, perché lo scorrimento virtuale vede un'altezza nulla; nei test si usa `stubViewportHeight` e `openSelect`.

**Layout e colori: due trappole di NG-ZORRO.** Primo: nz-layout dispone i figli in colonna e passa alla riga solo se contiene un nz-sider; poiché il menu laterale è un componente nostro (lc-sidebar), il contenitore del corpo dichiara esplicitamente flex-direction: row, altrimenti il menu finisce sopra il contenuto. Secondo: la scala di tonalità di Ant (generate) è pensata per colori medio-chiari e su un verde o rosso scuro produce tinte grigiastre; per le etichette di successo ed errore sul tema chiaro il ponte calcola quindi sfondo e bordo schiarendo il colore verso il bianco. Terzo: un contenitore con overflow-x: auto mostra anche una barra verticale se il suo contenuto è più alto di un pixel, quindi la paginazione sta fuori dall'area che scorre. Chi aggiunge componenti verifica sempre l'aspetto in un browser reale, chiaro e scuro, perché i test in jsdom non lo coprono.

**Regole aggiunte con i componenti di ottobre 2026.** Elenchi e date passati a `ngModel` (selezione multipla, intervalli) si calcolano una volta per valore con `computed`, altrimenti il rilevamento delle modifiche non si ferma. Il titolo predefinito di `nz-tree` inserisce HTML durante la ricerca: i titoli si disegnano con un template, come testo. La lingua dei selettori di date segue `NzDateAdapter.setLocale`. Un elemento destinato a uno spazio di NG-ZORRO (per esempio il filtro in un'intestazione di tabella) deve essere l'unico nodo del suo `@if`. Un componente che scrive nello stato (`bind`) gli dà un valore iniziale in `ScreenRuntime`, così espressioni e data source non trovano mai una chiave mancante; la logica sui dati sta in funzioni pure, testabili senza disegnare. Specifiche e limiti di ogni componente: `docs/catalogo-componenti.md`.

## 7. Client HTTP, errori e stato

| Regola | Dettaglio |
| --- | --- |
| Un solo client | Tutte le chiamate passano dal client HTTP della piattaforma; l'uso diretto di `fetch` o `HttpClient` nei componenti è bloccato da una regola di analisi del codice |
| Modello di errore uniforme | Ogni errore ha `code`, `message`, `correlationId` e, se utile, `details`; l'interfaccia non mostra mai l'errore tecnico grezzo |
| 401 | Il client avvia il rinnovo della sessione o riporta all'accesso; non mostra un errore generico |
| 403 | Messaggio uniforme, richiesta di aggiornamento dei permessi, rivalutazione dell'interfaccia |
| Errori 5xx e di rete | Messaggio generico per l'utente; l'identificativo di correlazione è visibile per il supporto |
| Ripetizioni | Solo per richieste in lettura, con attesa crescente e un numero massimo di tentativi; mai per operazioni che modificano dati, salvo chiave di idempotenza |
| Tempi massimi e annullamento | Ogni chiamata ha un tempo massimo configurabile e viene annullata quando si lascia la schermata |
| Stato per schermata | Uno store con signals, immutabile; i valori derivati con `computed`; nessuno stato globale condiviso tra schermate |
| Cache dei dati | Esplicita, con invalidazione dichiarata dall'azione (`refresh`), mai implicita |

## 8. Autenticazione e autorizzazione: regole pratiche

| Regola | Motivo |
| --- | --- |
| I token non vanno mai in `localStorage` o `sessionStorage` | Sono leggibili da qualunque script iniettato (XSS) |
| In modalità BFF il cookie di sessione è `HttpOnly`, `Secure` e `SameSite`, con protezione CSRF sulle richieste che modificano dati | Il browser non deve poter leggere né inviare cross-site la sessione |
| In modalità SPA il token resta solo in memoria e ha durata breve | Riduce il danno in caso di compromissione |
| Il frontend non prende mai decisioni di sicurezza | Nascondere è esperienza d'uso; il backend verifica e filtra sempre |
| Le condizioni usano i permessi (`can`), mai i ruoli | I permessi sono il contratto con il backend |
| Le capacità sono caricate dopo il login e rinnovate al cambiare della versione dei permessi | Evita sia richieste continue sia interfacce obsolete |
| Per ogni condizione di permesso c'è un test con almeno un utente che ha il permesso e uno che non lo ha | Una regola non testata non si può considerare funzionante |
| Il logout cancella lo stato dell'applicazione e le capacità in memoria | Nessun dato resta visibile al prossimo utente dello stesso browser |
| Le chiamate verso host non nell'elenco consentito vengono rifiutate | Impedisce che un JSON manomesso indirizzi dati altrove |

## 9. Telemetria, log e dati sensibili

La regola di fondo: si registra **che cosa è successo**, mai **quali dati erano coinvolti**. Si può sapere che l'azione "approva" è fallita sulla schermata ordini; non si scrive il nome del cliente.

| Elemento | Regola |
| --- | --- |
| Uso della console | `console.log` e simili sono vietati nel codice di produzione; si usa il servizio di telemetria |
| Nomi delle tracce | `screen.open`, `action.run`, `http.client`, con attributi concordati |
| Attributi ammessi | Identificativi tecnici: `screenId`, `componentId`, `actionId`, `appVersion`, `schemaVersion`, esito |
| Valori dei dati | Mai negli attributi, nei messaggi di errore o nei log |
| Campi `sensitive` | Esclusi all'origine dal runtime; l'endpoint di ingestione applica una seconda redazione |
| Propagazione | Ogni chiamata REST porta `traceparent` e il contesto (schermata, azione) nel baggage |
| Livelli di log | `error` e `warn` sempre inviati; `info` e `debug` secondo configurazione per ambiente |
| Campionamento | Configurabile; gli errori non sono mai scartati |
| Audit | Prodotto solo dal backend; il frontend non scrive audit né lo sostituisce con i log |

## 10. Sicurezza: regole da non violare

Il documento JSON è input non fidato. Le regole sotto sono controllate dalla pipeline, non solo dalla revisione.

**Ajv e CSP.** Ajv genera il validatore con `new Function`: nel browser va compilato in anticipo (Ajv standalone) o la validazione va fatta alla pubblicazione, altrimenti serve `unsafe-eval` nella CSP, non ammesso in produzione. Gli URL dei data source sono relativi: sono rifiutati URL assoluti, `//`, `\` e `..`, e i parametri sono codificati con `encodeURIComponent`. Gli errori del server non si mostrano all'utente.

| Regola | Come si verifica |
| --- | --- |
| Vietati `eval`, `new Function` e tecniche equivalenti | Regola di analisi del codice bloccante |
| Vietati `innerHTML` e le funzioni di bypass della sanitizzazione di Angular, salvo eccezione approvata | Regola di analisi del codice; ogni eccezione ha un commento e un revisore |
| I valori dei dati sono sempre inseriti come testo, anche con NG-ZORRO: modali e messaggi interpretano le stringhe come HTML, quindi si passano componenti o testo reso innocuo | Test con payload XSS nelle applicazioni di esempio |
| Politica CSP restrittiva, senza `unsafe-eval` e senza script inline | Test automatico sulle intestazioni del runtime e della reference implementation |
| Nessun caricamento di script, stili o componenti da indirizzi indicati nel JSON | Validazione dello schema e test di non regressione |
| Chiamate solo verso host dell'elenco consentito | Test del client HTTP con host non consentiti |
| Limiti su dimensione e profondità del JSON e sul tempo di valutazione delle espressioni | Test con documenti ostili; il superamento dei limiti è un errore gestito, non un blocco |
| Dipendenze analizzate e inventariate | Analisi delle vulnerabilità e SBOM a ogni build; le vulnerabilità gravi bloccano il rilascio |
| Nessun segreto nel repository | Scansione dei segreti sui commit |
| Componenti personalizzati solo con revisione | Il catalogo accetta registrazioni solo dal codice approvato, mai a runtime |

## 11. Strategia di test

Le applicazioni di esempio in `examples` sono il filo conduttore: ogni livello di test le usa, così un cambiamento che le rompe si vede subito.

**Comandi utili.** Dalla cartella `frontend`: `npm run validate:examples` convalida schermate, temi e `navigation.json`; `npm test` esegue tutti i test; l'applicazione demo si avvia con un solo comando e usa dati simulati con tre profili (operatore, responsabile, amministratore) per provare permessi e menu. Per ogni modifica ai permessi o al menu si aggiunge un test che copre sia l'utente con il permesso sia quello senza.

**Test dei componenti e della vetrina.** Ogni componente ha tre livelli di test: lo schema (`schema/new-components.spec.ts`), il componente montato in una schermata con porte finte (`renderScreen` in `components/screen-testing.ts`) e la vetrina della demo (`openShowcase` in `runtime/showcase-testing.ts`), che verifica anche che le segnalazioni tecniche restino vuote. Quello che jsdom non può vedere (impaginazione, focus reale, colori, tempi) si controlla nel browser sulla demo prima di ogni commit; le prestazioni della datatable hanno test con 20.000 e 50.000 righe.

| Livello | Cosa verifica | Strumenti |
| --- | --- | --- |
| Unit | Valutatore di espressioni, motore di azioni, migrazioni dello schema, client HTTP | Framework di test unitari di Angular e TypeScript |
| Contratto dello schema | Ogni componente accetta e rifiuta esattamente ciò che il suo schema dichiara | Ajv e test generati dagli schemi |
| Contratto REST | I servizi rispettano le specifiche OpenAPI; la reference implementation e i backend dei clienti superano gli stessi test di conformità | Test di contratto generati da `contracts` |
| Componente | Rendering, eventi, permessi, accessibilità | Test dei componenti Angular, controlli automatici di accessibilità |
| Integrazione del runtime | Caricamento di un'app di esempio, interpretazione, chiamate verso simulazioni di API | Runtime con backend simulato |
| End-to-end | Percorsi completi su app di esempio, con la **matrice dei permessi**: stesso percorso con utenti diversi e verifica di ciò che vedono e possono fare | Playwright |
| Sicurezza | Payload XSS nei dati, JSON ostili, espressioni al limite, host non consentiti | Test dedicati e scansioni automatiche |
| Migrazioni | Ogni versione dello schema migra le app di esempio e il risultato resta valido e funzionante | Test di non regressione sulle migrazioni |
| Telemetria | Le tracce hanno gli attributi attesi e i campi sensibili non compaiono | Test con collector simulato |

## 12. Integrazione continua, versionamento e rilascio

| Fase della pipeline | Cosa fa | Blocca il rilascio? |
| --- | --- | --- |
| Qualità | Analisi del codice, tipi, formattazione, regole di dipendenza tra librerie | Sì |
| Test unitari e di componente | Vedi sezione 11 | Sì |
| Validazione di schemi ed esempi | Gli esempi sono validi contro lo schema corrente e migrano dalle versioni precedenti | Sì |
| Contratti REST | Specifiche OpenAPI valide; test di contratto sulla reference implementation | Sì |
| Sicurezza | Analisi delle dipendenze, scansione dei segreti, generazione SBOM | Sì per gravità alta |
| End-to-end e accessibilità | Percorsi su app di esempio e controlli di accessibilità | Sì |
| Pubblicazione degli artefatti | Pacchetti, immagini e documentazione, con versione e hash | No, avviene a pipeline verde |

**Versioni.** La piattaforma segue il versionamento semantico. Lo `schemaVersion` ha una propria versione: un cambio incompatibile dello schema richiede una versione maggiore e una migrazione automatica, entrambe obbligatorie. Il runtime supporta la versione corrente e la precedente.

**Contratti e reference implementation.** Le specifiche OpenAPI e la reference implementation sono versionate insieme: una modifica al contratto senza aggiornamento della reference implementation e dei test di conformità non viene accettata.

**Note di rilascio.** Ogni rilascio indica modifiche dello schema, nuovi permessi, cambiamenti ai contratti e istruzioni di migrazione.

**Ambienti.** Sviluppo, collaudo e produzione; la promozione di una versione è esplicita e tracciata. Le funzioni nuove e rischiose si attivano con interruttori di configurazione, non con rilasci separati.

## 13. Checklist di revisione

Da usare in ogni richiesta di modifica; una voce non applicabile si segna come tale, non si salta.

**Schema e linguaggio**

- [ ] Le modifiche allo schema sono compatibili, oppure hanno versione maggiore e migrazione
- [ ] Gli `id` pubblicati non sono stati cambiati
- [ ] Gli esempi sono aggiornati e validi

**Sicurezza e permessi**

- [ ] Nessun `eval`, `innerHTML` o bypass di sanitizzazione senza eccezione approvata
- [ ] Nessun token in storage del browser e nessun segreto nel codice o nel JSON
- [ ] Le condizioni usano `can`, non ruoli; esistono test con e senza permesso
- [ ] I campi personali sono marcati `sensitive`

**Comportamento**

- [ ] Tutte le chiamate passano dal client HTTP; errori 401, 403 e di rete gestiti
- [ ] Ogni azione che modifica dati ha un `onError`
- [ ] Telemetria presente, senza valori di dati negli attributi

**Qualità**

- [ ] Test aggiunti ai livelli giusti (sezione 11)
- [ ] Accessibilità verificata per i componenti nuovi
- [ ] Se cambia un contratto REST: specifica, reference implementation e test di conformità aggiornati insieme
- [ ] Documentazione e note di rilascio aggiornate
