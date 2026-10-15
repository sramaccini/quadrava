# Piattaforma LowCode — Documento Funzionale

Simone Ramaccini · 7 ottobre 2026

## 1. Scopo e visione

La Piattaforma LowCode permette di costruire applicazioni gestionali e amministrative descrivendo l'interfaccia in JSON, invece di scrivere codice frontend ogni volta. Si rivolge a chi deve produrre molte applicazioni simili (liste, filtri, form, schede di dettaglio) senza rifare ogni volta autenticazione, permessi e tracciamento.

Un'immagine semplice: la piattaforma funziona come un set di mattoncini con il libretto delle istruzioni. Il **JSON** è il libretto (dice quali pezzi servono e dove vanno), il **runtime** è chi monta i pezzi leggendo il libretto, l'**editor visuale** è lo strumento che permette di scrivere il libretto trascinando i pezzi, senza digitarlo a mano.

La piattaforma è un prodotto a sé, usato per sviluppare applicazioni diverse. Ogni applicazione eredita tre servizi di base che non deve riscrivere: autenticazione OAuth2/JWT, autorizzazione granulare tramite API REST di backend e tracciamento/logging distribuito.

Il punto di forza atteso è la **governabilità**: l'intera applicazione è un documento JSON validabile, versionabile e confrontabile, quindi revisionabile come si fa con il codice.

## 2. Attori e ruoli

Cinque figure interagiscono con la piattaforma; la distinzione tra chi costruisce l'app e chi la usa è la più importante.

| Attore | Chi è | Cosa fa con la piattaforma |
| --- | --- | --- |
| Sviluppatore di applicazioni | Chi costruisce un gestionale | Definisce schermate, dati e azioni con l'editor o scrivendo il JSON; pubblica l'app |
| Utente finale | Chi usa il gestionale | Si autentica, usa le schermate che i suoi permessi consentono |
| Amministratore della piattaforma | Chi gestisce il prodotto | Gestisce il registry delle applicazioni, le versioni, i temi e i componenti disponibili |
| Team backend dell'applicazione | Chi sviluppa le API di business | Implementa le API di business e i contratti REST di autorizzazione e telemetria |
| Responsabile sicurezza / audit | Chi controlla la conformità | Consulta tracce tecniche e audit trail, verifica chi ha fatto cosa e quando |

## 3. Perimetro del prodotto

La piattaforma **fornisce il frontend, le interfacce REST e una reference implementation**; non fornisce i backend di business né un sistema di gestione delle identità. Questa scelta è condivisa e fissa il confine del prodotto.

**Dentro il perimetro**

- Un linguaggio dichiarativo in JSON per descrivere applicazioni gestionali, con il relativo JSON Schema.
- Un runtime che interpreta il JSON e produce l'applicazione.
- Un editor visuale che crea e modifica il JSON.
- Servizi di base integrati nel runtime: autenticazione, autorizzazione, tracing/logging.
- I contratti REST (specifiche OpenAPI) che i backend devono implementare per autorizzazione e telemetria.
- Un registry per conservare, versionare e pubblicare le definizioni delle applicazioni.
- Una reference implementation dei servizi di backend (autorizzazione, telemetria, registry) che dimostra e verifica la conformità ai contratti REST.

**Fuori dal perimetro**

- Le API di business delle singole applicazioni.
- Il provider di identità (si usa uno standard OIDC come Keycloak).
- Le implementazioni di produzione dei servizi di backend: la reference implementation non è pensata per la produzione, quelle vere sono del cliente.
- La piattaforma di raccolta e analisi dei log (si usano strumenti standard compatibili con OpenTelemetry).

**Principio chiave:** il frontend non è mai il punto di enforcement. Nascondere un pulsante migliora l'esperienza d'uso; la sicurezza vera è sempre nel backend.

## 4. Definizione dell'applicazione (il linguaggio JSON)

L'intera applicazione è un documento JSON con pochi concetti, sempre gli stessi. Priorità secondo MoSCoW: D = deve esserci, S = dovrebbe esserci, P = può esserci.

| Concetto | Cos'è, in parole semplici | Esempio |
| --- | --- | --- |
| Applicazione | L'insieme: nome, versione, tema, menu di navigazione | "Gestione ordini" |
| Schermata | Una pagina dell'app | Elenco ordini |
| Componente | Un pezzo di schermata | Tabella, form, campo, pulsante, grafico |
| Data source | Da dove arrivano i dati: una chiamata REST dichiarata | GET /ordini con filtri e paginazione |
| Azione | Cosa succede a un clic: una sequenza di passi | Salva, poi mostra messaggio, poi torna all'elenco |
| Espressione | Una piccola formula per condizioni e calcoli | "mostra solo se stato = bozza" |
| Stato | I valori che la schermata ricorda | Filtro scelto, riga selezionata |
| Caso d'uso | Un'area funzionale dell'app con il proprio menu, scelta da un selettore | "Inserimento Fattura", "Revisione Spese" |
| Permesso | Una chiave che abilita un'azione, nel formato dominio.risorsa.azione | ordini.ordine.approva |

| ID | Requisito | Priorità |
| --- | --- | --- |
| RF-DEF-01 | L'applicazione è un documento JSON validato da un JSON Schema; la versione dello schema è scritta nel documento | D |
| RF-DEF-02 | Una schermata contiene componenti annidati con un layout dichiarato | D |
| RF-DEF-03 | I data source dichiarano metodo, URL, parametri, intestazioni e trasformazione della risposta; supportano paginazione, ordinamento e filtri | D |
| RF-DEF-04 | Le azioni sono sequenze di passi (chiama API, naviga, aggiorna stato, mostra messaggio) con gestione esplicita dell'errore | D |
| RF-DEF-05 | Le espressioni governano visibilità, abilitazione, valori calcolati e validazioni; il linguaggio è deterministico e isolato (nessun accesso a DOM, rete o codice arbitrario) | D |
| RF-DEF-06 | La validazione dei campi è dichiarativa: obbligatorietà, formato, regole tra più campi | D |
| RF-DEF-07 | La navigazione è un documento a parte (casi d'uso con menu a tre livelli) che apre le schermate con parametri; vedi RF-DEF-12 e seguenti | D |
| RF-DEF-08 | Il sistema permette di registrare componenti personalizzati con un contratto definito (via di fuga per i casi non coperti) | D |
| RF-DEF-09 | Un data source può essere generato importando una specifica OpenAPI | S |
| RF-DEF-10 | Il tema è un documento di design token (colori, tipografia, angoli, densità), validato da schema, applicato come variabili CSS e ai colori principali della libreria grafica NG-ZORRO, e cambiabile a runtime senza ricaricare (anche tra chiaro e scuro); l'aspetto generale dell'applicazione segue lo stile di Ant Design Pro (barra laterale, barra superiore, intestazione di pagina con briciole di pane, contenuto in card); anche questi aspetti, colori e misure comprese, sono token del tema e si cambiano senza toccare il codice; le schermate non contengono colori fissi | D |
| RF-DEF-11 | Le definizioni hanno versione e supportano la migrazione automatica verso schemi più recenti | D |
| RF-DEF-12 | Il menu è definito da un documento di navigazione separato dalle schermate: un elenco di casi d'uso, ciascuno con un albero di voci fino a tre livelli (gruppo, sottogruppo, voce); una voce apre una schermata con parametri statici | D |
| RF-DEF-13 | Le voci del menu sono visibili in base ai permessi (requires) e a un'espressione (visibleIf); i gruppi e i casi d'uso senza voci visibili non compaiono; un'espressione in errore nasconde la voce. Il menu è solo comodità: il controllo resta nella schermata e nel backend | D |
| RF-DEF-14 | Un selettore permette di passare da un caso d'uso all'altro: mostra solo quelli consentiti all'utente, non compare se ne esiste uno solo e il cambio riporta all'ultima schermata visitata in quel caso d'uso | D |
| RF-DEF-15 | Ogni schermata ha un indirizzo del tipo /caso-d-uso/schermata?parametri: funzionano Indietro, preferiti e link condivisi, e la voce attiva del menu è evidenziata | D |
| RF-DEF-16 | Un form può non avere un data source (inserimento) e partire da valori iniziali dichiarati; le azioni possono inviare i valori del form come corpo della richiesta | D |
| RF-DEF-17 | Le traduzioni (i18n) sono dichiarabili e applicate uniformemente | S |
| RF-DEF-18 | Le tabelle si ordinano (in pagina o dal servizio), selezionano righe con azioni multiple, raccolgono le azioni di riga in un menu, aprono righe di dettaglio e mostrano una riga dei totali; la datatable filtra, ordina e raggruppa in pagina decine di migliaia di righe caricate | D |
| RF-DEF-19 | I form offrono area di testo, data e ora, radio, interruttore, selezione multipla, ricerca su data source (lookup, che mostra il testo anche di un valore non caricato), caricamento di file (multipart fino a 100 MB), griglia a colonne e righe ripetibili | D |
| RF-DEF-20 | Un passo dialog apre una finestra con un form; se l'utente annulla la sequenza si ferma senza errori, come per la conferma | D |
| RF-DEF-21 | Le schermate possono mostrare indicatori (KPI), grafici a barre, linee e torta (impilati, con secondo asse, combinati), procedure a passi, viste ad albero usabili da tastiera e un calendario mensile; specifiche e limiti nel catalogo dei componenti del repository (docs/catalogo-componenti.md) | D |

## 5. Runtime e autenticazione

Il runtime legge la definizione dell'applicazione e la trasforma in schermate funzionanti. Tutto il traffico verso le API passa da **un unico client HTTP** del runtime: è qui che token, tracciamento e gestione degli errori sono applicati in modo uniforme, senza che l'autore dell'app debba occuparsene.

| ID | Requisito | Priorità |
| --- | --- | --- |
| RF-RUN-01 | Il runtime carica la definizione pubblicata dal registry e la valida prima dell'uso | D |
| RF-RUN-02 | Il runtime produce le schermate a partire dal JSON, senza compilazione per ogni modifica | D |
| RF-RUN-03 | Tutte le chiamate REST passano da un unico client che applica token, identificativi di tracciamento e gestione uniforme di 401, 403 ed errori di rete | D |
| RF-RUN-04 | Il runtime gestisce stati di caricamento, vuoto ed errore in modo coerente | D |
| RF-RUN-05 | Il runtime espone alle espressioni gli oggetti predefiniti: utente corrente, permessi, stato della schermata | D |
| RF-RUN-06 | Quando cambiano i permessi dell'utente, menu e schermate si aggiornano senza ricaricare la pagina; le condizioni in errore falliscono chiuse (la parte resta nascosta o in sola lettura) | D |
| RF-RUN-07 | Una schermata o un menu non validi (schema o espressioni) non vengono mostrati: il runtime segnala il motivo invece di disegnarli a metà | D |

L'autenticazione usa standard attuali e non prevede alternative proprietarie.

| ID | Requisito | Priorità |
| --- | --- | --- |
| RF-AUT-01 | Login tramite OAuth2 Authorization Code con PKCE su OIDC (provider esterno, per esempio Keycloak) | D |
| RF-AUT-02 | Nessuna schermata dell'applicazione è mostrata prima dell'autenticazione (landing gate) | D |
| RF-AUT-03 | La gestione dei token è configurabile: modalità BFF (token solo lato server, il browser ha un cookie di sessione) o modalità SPA con token in memoria; la modalità BFF è raccomandata per contesti regolati | D |
| RF-AUT-04 | Scadenza, rinnovo e logout sono gestiti dal runtime, con ritorno pulito alla schermata di accesso | D |
| RF-AUT-05 | Il JSON dell'applicazione non contiene mai segreti: solo riferimenti al provider di identità | D |
| RF-AUT-06 | I dati dell'utente (nome, ruoli, claim) sono disponibili alle espressioni tramite l'oggetto predefinito dell'utente | D |

## 6. Autorizzazione granulare

L'autenticazione dice **chi sei** (il cartellino all'ingresso); l'autorizzazione dice **cosa puoi fare** (quali porte apre quel cartellino). Il backend decide e il frontend si adegua: se un permesso manca, la parte corrispondente dell'interfaccia sparisce o si blocca, ma il backend rifiuta comunque la richiesta.

Il backend dell'applicazione espone un contratto REST standard, definito dalla piattaforma, che restituisce le **capacità** dell'utente corrente. Il runtime le carica dopo il login, le tiene in cache e le rende disponibili alle espressioni, per esempio la condizione "mostra il pulsante solo se l'utente può approvare ordini".

| Livello | Cosa si può controllare | Esempio |
| --- | --- | --- |
| Schermata | Accesso alla pagina e voce di menu | Solo i responsabili vedono "Approvazioni" |
| Sezione / componente | Presenza di un blocco | Il pannello "Storico" è visibile solo agli auditor |
| Campo | Nascosto, sola lettura o modificabile | L'IBAN è in sola lettura per l'operatore |
| Azione | Pulsante visibile e abilitato | "Annulla ordine" solo con permesso dedicato |
| Riga di dati | Permessi per singola istanza | Si modifica solo l'ordine della propria filiale |

| ID | Requisito | Priorità |
| --- | --- | --- |
| RF-AUZ-01 | Il contratto REST di autorizzazione è pubblicato come specifica OpenAPI e implementabile da qualunque backend | D |
| RF-AUZ-02 | Il runtime carica le capacità dell'utente dopo il login e le mette in cache; le rinnova a intervalli o su evento | D |
| RF-AUZ-03 | Ogni nodo del JSON (schermata, sezione, componente, campo, azione) può dichiarare condizioni di visibilità, abilitazione e sola lettura basate sui permessi | D |
| RF-AUZ-04 | I permessi per singola riga arrivano insieme ai dati, non da un elenco globale | D |
| RF-AUZ-05 | Una risposta 403 del backend è gestita in modo uniforme (messaggio chiaro e aggiornamento dei permessi) | D |
| RF-AUZ-06 | Il backend filtra comunque i dati non consentiti: il frontend non è mai il punto di enforcement | D |
| RF-AUZ-07 | Anche editor e registry applicano lo stesso meccanismo: chi può modificare e pubblicare un'applicazione è un permesso | D |

## 7. Tracing, logging e audit

Si tratta di tre cose diverse, con garanzie diverse. La **traccia tecnica** serve a capire dove è andata storta una richiesta, il **log applicativo** racconta cosa ha fatto l'app, l'**audit** risponde alla domanda "chi ha fatto cosa e quando" e deve essere affidabile e non modificabile.

Per la parte tecnica si usa uno standard aperto, **OpenTelemetry**, invece di un protocollo proprietario. Una singola azione dell'utente diventa una traccia che attraversa frontend e backend grazie all'intestazione W3C `traceparent` aggiunta a ogni chiamata REST.

| ID | Requisito | Priorità |
| --- | --- | --- |
| RF-TEL-01 | Il runtime genera tracce per i momenti significativi: apertura schermata, esecuzione azione, chiamata API | D |
| RF-TEL-02 | Ogni chiamata REST include l'intestazione `traceparent`, così la traccia continua nei servizi di backend | D |
| RF-TEL-03 | Il runtime invia tracce e log a un endpoint REST di ingestione protetto (formato OTLP/HTTP), non direttamente a un collector | D |
| RF-TEL-04 | L'invio è raggruppato, con campionamento configurabile, e non si perde alla chiusura della pagina | D |
| RF-TEL-05 | Gli errori non gestiti e quelli delle API sono registrati con contesto: schermata, azione, identificativo di correlazione | D |
| RF-TEL-06 | I campi marcati come sensibili nel JSON sono esclusi da tracce e log (redazione dei dati personali) | D |
| RF-TEL-07 | Il livello di dettaglio dei log è configurabile per applicazione e per ambiente | S |
| RF-AUD-01 | L'audit trail è prodotto dal backend, non dal frontend, perché il frontend non è un'origine affidabile | D |
| RF-AUD-02 | Il frontend fornisce al backend il contesto utile all'audit (schermata, azione, identificativo di correlazione) tramite le stesse intestazioni di tracciamento | D |
| RF-AUD-03 | Immutabilità e durata di conservazione dell'audit sono definite per applicazione e rispettano i vincoli normativi del cliente | D |

## 8. Editor visuale

L'editor permette a chi non vuole scrivere JSON a mano di costruire un'applicazione trascinando i pezzi. Il JSON resta l'unica fonte di verità: l'editor non ha un formato suo, legge e scrive lo stesso documento che usa il runtime. Questo permette di alternare editor visuale e modifica diretta del testo senza perdere nulla.

| ID | Requisito | Priorità |
| --- | --- | --- |
| RF-EDT-01 | Canvas con trascinamento dei componenti da una palette, organizzati per schermata | D |
| RF-EDT-02 | Pannello delle proprietà generato automaticamente dal JSON Schema di ciascun componente | D |
| RF-EDT-03 | Vista JSON sincronizzata con il canvas, modificabile in entrambe le direzioni | D |
| RF-EDT-04 | Anteprima dal vivo con il runtime reale, non con una simulazione | D |
| RF-EDT-05 | Validazione in tempo reale con errori comprensibili e posizione nel documento | D |
| RF-EDT-06 | Annulla/ripeti e salvataggio con versione nel registry | D |
| RF-EDT-07 | Confronto (diff) leggibile tra due versioni di un'applicazione | D |
| RF-EDT-08 | Anteprima "come se fossi" un utente con permessi scelti, per verificare visibilità e blocchi | S |
| RF-EDT-09 | Creazione guidata di data source e schermate a partire da una specifica OpenAPI | S |
| RF-EDT-10 | Pubblicazione controllata: la modifica diventa disponibile agli utenti solo dopo una pubblicazione esplicita, con possibilità di ripristino | D |
| RF-EDT-11 | Modifica simultanea con meccanismi di blocco (lock): non nella prima versione, dalle successive | P |

## 9. Esempi pratici

I due esempi mostrano la sintassi indicativa del linguaggio; i nomi esatti dei campi saranno fissati nel JSON Schema ufficiale. Le formule tra doppie graffe sono espressioni; `can(...)` interroga i permessi dell'utente, con nomi nel formato dominio.risorsa.azione (per esempio ordini.ordine.approva); row.\_perm e form.\_perm portano i permessi sul singolo record.

**Esempio 1 — Elenco ordini con filtro e azione sulla riga.** Il pulsante "Approva" compare solo se l'utente ha il permesso e l'ordine è nello stato giusto.

```json
{
  "schemaVersion": "1.0",
  "screen": "ordini-elenco",
  "title": "Ordini",
  "requires": "ordini.ordine.leggi",
  "dataSources": {
    "ordini": {
      "type": "rest", "method": "GET", "url": "/api/ordini",
      "params": { "stato": "{{state.filtri.stato}}", "page": "{{state.page}}" },
      "paging": "server"
    },
    "approvaOrdine": { "type": "rest", "method": "POST", "url": "/api/ordini/{{id}}/approva" }
  },
  "components": [
    { "type": "filterBar", "bind": "state.filtri",
      "fields": [ { "name": "stato", "type": "select", "label": "Stato",
                    "options": ["bozza", "inviato", "approvato"] } ] },
    { "type": "table", "source": "ordini",
      "columns": [ { "field": "numero" }, { "field": "cliente" }, { "field": "stato" } ],
      "rowActions": [ {
        "label": "Approva",
        "visibleIf": "{{can('ordini.ordine.approva') && row.stato == 'inviato'}}",
        "onClick": [
          { "call": "approvaOrdine", "args": { "id": "{{row.id}}" } },
          { "refresh": "ordini" },
          { "toast": "Ordine approvato" }
        ]
      } ]
    }
  ]
}
```

**Esempio 2 — Form di dettaglio con campi condizionati dai permessi.** L'IBAN può essere nascosto, in sola lettura o modificabile a seconda dei permessi; il salvataggio dipende anche dai permessi della singola riga.

```json
{
  "schemaVersion": "1.0",
  "screen": "ordine-dettaglio",
  "requires": "ordini.ordine.leggi",
  "components": [ {
    "type": "form", "source": "ordine",
    "fields": [
      { "name": "cliente", "type": "text", "required": true },
      { "name": "tipo", "type": "select", "options": ["privato", "business"] },
      { "name": "sconto", "type": "number",
        "visibleIf": "{{form.tipo == 'business'}}",
        "validate": { "rule": "{{value <= 20}}", "message": "Sconto massimo 20%" } },
      { "name": "iban", "type": "text", "sensitive": true,
        "hiddenIf": "{{!can('ordini.iban.leggi')}}",
        "readOnlyIf": "{{!can('ordini.iban.scrivi')}}" }
    ],
    "actions": [ {
      "label": "Salva",
      "enabledIf": "{{can('ordini.ordine.scrivi') && form._perm.update}}",
      "onClick": [ { "call": "salvaOrdine" }, { "navigate": "ordini-elenco" } ]
    } ]
  } ]
}
```

Il campo `sensitive: true` indica al runtime di non includere mai quel valore in tracce e log (requisito RF-TEL-06).

**Esempio 3 — il menu.** Un documento a parte elenca i casi d'uso; ognuno ha il proprio menu a tre livelli (gruppo, sottogruppo, voce). Un operatore vede solo i casi d'uso e le voci per cui ha il permesso; un gruppo senza voci visibili sparisce. Due voci possono aprire la stessa schermata con parametri diversi.

```json
{
  "schemaVersion": "1.0",
  "navigation": "fatturazione",
  "default": "consultazione-fatture",
  "useCases": [
    { "id": "inserimento-fattura", "label": "Inserimento Fattura", "requires": "fatture.fattura.crea",
      "items": [ { "id": "nuova-fattura", "label": "Nuova fattura", "children": [
        { "id": "fattura-attiva", "label": "Fattura attiva", "screen": "fattura-nuova", "params": { "tipo": "attiva" } },
        { "id": "da-ordine", "label": "Da ordine", "children": [
          { "id": "scegli-ordine", "label": "Scegli l'ordine", "screen": "ordini-elenco", "requires": "ordini.ordine.leggi" } ] } ] } ] },
    { "id": "revisione-spese", "label": "Revisione Spese", "requires": "spese.spesa.leggi",
      "items": [ { "id": "spese", "label": "Spese", "children": [
        { "id": "da-revisionare", "label": "Da revisionare", "screen": "spese-elenco", "params": { "stato": "da-revisionare" } },
        { "id": "revisionate", "label": "Revisionate", "screen": "spese-elenco", "params": { "stato": "revisionata" } } ] } ] }
  ]
}
```

I casi d'uso di questo esempio sono solo dati: la piattaforma non ne ha di predefiniti. Ogni schermata ha un indirizzo come /revisione-spese/spese-elenco?stato=da-revisionare, quindi Indietro, preferiti e link condivisi funzionano.

## 10. Requisiti non funzionali

Gli obiettivi quantitativi (tempi, volumi) non sono ancora definiti: vanno concordati prima della fase di progettazione di dettaglio.

| Area | Requisito |
| --- | --- |
| Sicurezza | Espressioni eseguite in un ambiente isolato; politica CSP restrittiva; nessun segreto nel JSON; protezione da XSS e da iniezione tramite i valori dei dati |
| Privacy | Redazione dei dati personali in tracce e log; minimizzazione dei dati raccolti; compatibilità con il GDPR |
| Prestazioni | Caricamento iniziale e rendering di liste lunghe entro obiettivi da definire; paginazione lato server di default |
| Accessibilità | Conformità WCAG 2.2 livello AA per tutti i componenti di base |
| Compatibilità | Stack aggiornato (Angular e TypeScript nelle versioni correnti); browser moderni supportati ufficialmente |
| Manutenibilità | Schema versionato con migrazioni automatiche; componenti documentati e testati |
| Governabilità | JSON versionabile, confrontabile e revisionabile; storico delle pubblicazioni e ripristino |
| Osservabilità | Metriche e tracce del runtime stesso, non solo delle applicazioni costruite |
| Testabilità | Possibilità di scrivere test dichiarativi sulle applicazioni, riusabili in integrazione continua |
| Internazionalizzazione | Testi traducibili e formati regionali gestiti dal runtime |

## 11. Assunzioni, punti aperti e decisioni da prendere

**Assunzioni condivise:** la piattaforma fornisce frontend, interfacce REST e una reference implementation, non i backend di business di produzione; il provider di identità è esterno e standard OIDC; per la telemetria si adotta OpenTelemetry; il frontend non è mai il punto di enforcement.

| # | Punto aperto | Dove si decide |
| --- | --- | --- |
| 1 | Gestione dei token: BFF oppure token in memoria nel browser | Documento di architettura |
| 2 | Linguaggio delle espressioni: CEL, JSONata o JSONLogic | Documento di architettura |
| 3 | Formato esatto del contratto di autorizzazione (elenco di permessi, verifica a lotti, permessi per riga) | Documento di architettura |
| 4 | Modello multi-tenant e ambienti (sviluppo, collaudo, produzione) | Documento di architettura |
| 5 | Dove e come si conservano le definizioni (registry) e chi può pubblicarle | Documento di architettura |
| 6 | Forma di distribuzione del runtime: applicazione autonoma oppure componente integrabile in un'altra shell | Documento di architettura |
| 7 | Libreria di componenti grafici di base da adottare | Deciso: NG-ZORRO (Ant Design per Angular); vedi ADR-11 nel documento di architettura e le linee guida |
| 8 | Obiettivi quantitativi di prestazioni e volumi | Con il committente |
| 9 | Durata di conservazione e immutabilità dell'audit per i contesti regolati | Con il committente |
| 10 | Editing simultaneo: non serve nella prima versione; nelle successive si introdurranno meccanismi di lock | Deciso |
