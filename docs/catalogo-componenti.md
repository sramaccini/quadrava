# Catalogo dei componenti

Elenco dei componenti del linguaggio JSON, con la specifica di quelli aggiunti nell'ottobre 2026. Ogni componente nuovo ha test unitari nella libreria `components` e un esempio nella **vetrina** della demo (caso d'uso «Vetrina componenti»).

Regole comuni a tutti i componenti, valide anche per i nuovi:

- i testi passano da `{{ }}` e dal catalogo delle traduzioni (`t('chiave', 'ripiego')`); le scritte della piattaforma sono chiavi `lc.*` in italiano e inglese;
- nessun HTML da dati o traduzioni: i valori si mostrano sempre come testo;
- le espressioni sono **fail-closed**: se una condizione non si può valutare, il componente si nasconde o si disabilita;
- `visibleIf`, `hiddenIf`, `tooltip` valgono per ogni nodo (li applica il contenitore `lc-node`); `grow`, `span` e `region` valgono per ogni nodo dentro un contenitore di layout (§ 2.21);
- colori e misure solo dal tema (`var(--lc-*)` o i token NG-ZORRO).

## 1. Realizzati

| Nodo / elemento | A cosa serve |
| --- | --- |
| `section` | Riquadro con titolo che raggruppa altri nodi, uno sotto l'altro o affiancati (`layout: "row"`). |
| `box`, `grid`, `border` | Contenitori di layout senza riquadro: riga o colonna, griglia a colonne, regioni nord/sud/ovest/est/centro (§ 2.21). |
| `input` | Un campo a sé (casella di testo, elenco a discesa, data…) legato allo stato della schermata (§ 2.20). |
| `image`, `link` | Immagine con testo alternativo; collegamento a una schermata o a un indirizzo https (§ 2.23). |
| `progress` | Barra o cerchio di avanzamento (§ 2.23). |
| `timeline`, `kanban` | Eventi in ordine di data; schede in colonne da spostare (§ 2.24). |
| `text` | Testo semplice (con gli a capo), titolo (`style: heading`) o testo formattato (`format: markdown`, § 2.26). |
| `button` | Pulsante che esegue una sequenza di passi (`onClick`). |
| `filterBar` | Barra di filtri che scrive nello stato della schermata (`bind`). |
| `table` | Tabella con paginazione lato server, formati di cella, ordinamento, selezione e azioni multiple, menu delle azioni, righe espandibili, celle cliccabili e totali. |
| `dataTable` | Datatable con filtri, ordinamento e raggruppamento in pagina (§ 2.18). |
| `serverDataTable` | Stessa datatable, ma filtri, ordinamento, gruppi, totali e pagine li calcola il servizio (§ 2.19). |
| `form` | Form con validazione, campi condizionali, griglia a colonne e azioni. |
| `tabs` | Schede, ognuna con i propri nodi. |
| `detail` | Scheda di dettaglio in sola lettura (etichetta e valore; un campo `format: markdown` si mostra formattato). |
| `alert` | Messaggio nella pagina (info, successo, errore), anche formattato (`format: markdown`). |
| `stats` | Indicatori (KPI). |
| `wizard` | Procedura a passi. |
| `tree` | Vista ad albero. |
| `calendar` | Calendario mensile con eventi. |
| `chart` | Grafici a barre, linee e torta. |
| Campi | `text`, `number`, `select`, `checkbox`, `date`, `textarea`, `datetime`, `radio`, `switch`, `multiselect`, `lookup`, `file`, `repeater`, `richtext` (§ 2.26). |
| Formati di cella | `text`, `number`, `currency`, `percent`, `date`, `datetime`, `boolean`, `badge`, `markdown`. |
| Passi | `set`, `call`, `refresh`, `navigate`, `toast`, `confirm`, `dialog`, `validate`, `print`, `export` (§ 2.22). |
| Guscio | Barra laterale (`lc-sidebar`, con ricerca, contatori e tastiera: § 2.25; il marchio dell'applicazione si inserisce con un elemento `lcBrand`, altrimenti logo e nome), menu utente (`lc-user-menu`), barra superiore responsive, logotipo `lc-kinetix-wordmark`. |

## 2. Aggiunti nell'ottobre 2026

Realizzati in quest'ordine, uno per commit, ognuno con test (schema, componente e vetrina) e un esempio nella vetrina della demo: «Tabelle avanzate» (1–5), «Campi e form» (6–11), «Schede, dettaglio e messaggi» (12), «Cruscotto» (13, 17), «Procedure e viste» (14–16), «Datatable» (18, 19), «Campi a sé» (20, 22), «Contenitori di layout» (21, 22), «Attività e avanzamento» (23, 24); il menu (25) si vede in tutte.

| # | Componente | Area | Stato |
| --- | --- | --- | --- |
| 1 | Ordinamento delle colonne | tabella | realizzato |
| 2 | Selezione delle righe e azioni multiple | tabella | realizzato |
| 3 | Menu delle azioni di riga | tabella | realizzato |
| 4 | Righe di dettaglio espandibili | tabella | realizzato |
| 5 | Formato numerico, celle cliccabili, riga dei totali | tabella | realizzato |
| 6 | Nuovi tipi di campo: area di testo, data e ora, radio, interruttore, selezione multipla | campi | realizzato |
| 7 | Campo con ricerca su data source (lookup) | campi | realizzato |
| 8 | Caricamento di file | campi | realizzato |
| 9 | Griglia a colonne nel form | form | realizzato |
| 10 | Righe ripetibili nel form | form | realizzato |
| 11 | Dialog con form (passo `dialog`) | azioni | realizzato |
| 12 | Tooltip nella scheda di dettaglio | dettaglio | realizzato |
| 13 | Indicatori (KPI) | visualizzazione | realizzato |
| 14 | Procedura a passi (wizard) | layout | realizzato |
| 15 | Vista ad albero | visualizzazione | realizzato |
| 16 | Calendario | visualizzazione | realizzato |
| 17 | Grafici | visualizzazione | realizzato |
| 18 | Datatable con colonne filtrabili, ordinabili e raggruppabili | tabella | realizzato |
| 19 | Datatable pilotata dal servizio, per tabelle molto grandi | tabella | realizzato |
| 20 | Campi a sé (`input`) e sezione a riga | campi | realizzato |
| 21 | Contenitori di layout: box, griglia, border (con lati ridimensionabili) | layout | realizzato |
| 22 | Passi validate, print ed export (CSV) | azioni | realizzato |
| 23 | Immagine, collegamento, avanzamento | visualizzazione | realizzato |
| 24 | Timeline e kanban | visualizzazione | realizzato |
| 25 | Menu: ricerca, contatori, tastiera | guscio | realizzato |

### 2.1 Ordinamento delle colonne

Le colonne con `sortable: true` mostrano le frecce di ordinamento. Il clic alterna crescente, decrescente e nessun ordinamento.

```json
{ "type": "table", "source": "ordini",
  "sort": { "bind": "state.ordinamento", "default": { "field": "numero", "direction": "desc" } },
  "columns": [{ "field": "numero", "sortable": true }, { "field": "cliente", "sortable": true }] }
```

- **Tabella senza paginazione lato server**: ordina in pagina le righe caricate (numeri come numeri, testi secondo la lingua attiva, date ISO come testo).
- **Tabella con `paging: server`**: l'ordinamento lo fa il servizio. La tabella scrive `{ "field": …, "direction": "asc" | "desc" }` nello stato indicato da `sort.bind` e riporta alla prima pagina; il data source lo legge nei parametri, per esempio `"sort": "{{state.ordinamento.field}}"`. Senza `bind` le righe della pagina corrente vengono ordinate solo in pagina, con una segnalazione tecnica.
- `sort.default` vale all'apertura della schermata (lo stato esiste già al primo caricamento, come per i filtri).

### 2.2 Selezione delle righe e azioni multiple

```json
{ "type": "table", "source": "fatture",
  "selection": { "bind": "state.selezionate", "key": "id" },
  "bulkActions": [{ "label": "{{ t('fatture.invia_selezionate', 'Invia le selezionate') }}",
    "enabledIf": "{{ size(selection) > 0 }}",
    "onClick": [{ "call": "inviaMolte", "args": { "ids": "{{ selection.map(r, r.id) }}" } }, { "refresh": "fatture" }] }] }
```

- Una casella per riga e una nell'intestazione (tutte / nessuna / parziale).
- Lo stato `bind` contiene le **chiavi** delle righe scelte; le azioni multiple vedono le righe intere nella variabile `selection`.
- La selezione vale per le righe caricate: le chiavi che non compaiono più (nuova pagina, nuovi filtri) vengono tolte.
- Sopra la tabella compare la barra delle azioni multiple con il numero di righe scelte.

### 2.3 Menu delle azioni di riga

`rowActionsInline: n` mostra come pulsanti solo le prime `n` azioni visibili; le altre finiscono in un menu «⋯» (`0` = tutte nel menu). Senza la proprietà restano tutte pulsanti. Le azioni disabilitate restano visibili e disabilitate anche nel menu.

### 2.4 Righe di dettaglio espandibili

```json
"expand": { "components": [{ "type": "text", "text": "{{ row.note }}" }] }
```

Ogni riga ha un pulsante per aprire sotto di sé un'area con i nodi di `expand.components`, che vedono la riga come `row` (anche tabelle, dettagli e pulsanti). `expand.expandIf` (espressione con `row`) decide quali righe si possono espandere.

### 2.5 Formato numerico, celle cliccabili, riga dei totali

- Formato di cella `number` con `decimals` (da 0 a 6), allineato a destra e con le cifre separate secondo la lingua.
- `onClick` su una colonna: il valore diventa un collegamento che esegue i passi con la riga in `row` (per esempio `navigate` al dettaglio).
- `aggregate` su una colonna (`sum`, `avg`, `min`, `max`, `count`): in fondo alla tabella compare la riga dei totali, calcolata sulle righe caricate e con lo stesso formato della colonna.

### 2.6 Nuovi tipi di campo

| Tipo | Valore | Note |
| --- | --- | --- |
| `textarea` | testo | `rows` (righe visibili, da 2 a 20) |
| `datetime` | `AAAA-MM-GGTHH:mm` (ora locale) | selettore di data con ora |
| `radio` | uno dei valori di `options` | pulsanti di scelta, tradotti con `optionKey` |
| `switch` | `true` / `false` | interruttore |
| `multiselect` | elenco di valori di `options` | nei filtri diventa un parametro elenco |

Valgono nel form e, dove ha senso, nella barra dei filtri (`switch`, `multiselect`, `datetime`, `radio`; `textarea` vi si comporta come `text`).

### 2.7 Campo con ricerca su data source (lookup)

```json
{ "name": "cliente", "type": "lookup",
  "lookup": { "source": "clienti", "valueField": "id", "labelField": "nome", "minChars": 2 } }
```

```json
"clienti": { "type": "rest", "method": "GET", "url": "/api/clienti",
             "params": { "q": "{{ search }}", "id": "{{ lookupKey }}" } }
```

Mentre l'utente scrive, il campo esegue il data source `source` (GET) con la variabile `search` e propone le righe restituite. Il valore del campo è `valueField`; il testo mostrato è `labelField`. Le ricerche ravvicinate si accorpano (attesa di 300 ms) e una risposta vecchia non sovrascrive una più recente.

Se il valore corrente non è tra le righe note (per esempio in un form di modifica) e il data source usa `{{ lookupKey }}`, il campo chiede al servizio la riga di quel valore, una volta sola, e ne mostra il testo invece dell'id. Le richieste del campo non cambiano le righe che lo stesso data source mostra agli altri componenti (`ScreenRuntime.query`).

### 2.8 Caricamento di file

```json
{ "name": "allegato", "type": "file", "accept": ".pdf,image/*", "maxSizeKb": 20480, "upload": "caricaAllegato" }
```

- Un solo file per campo; `accept` e `maxSizeKb` sono controllati prima di qualunque invio.
- Con `upload` il file viene inviato subito al data source (POST). In **multipart** (`uploadAs: "multipart"`, predefinito) il file viaggia come file nella parte `file` della richiesta, fino a 100 MB; la variabile `file` ha `name`, `type` e `size`, e ogni voce del corpo (per esempio `"body": "{{ file }}"`) diventa una parte di testo. In **base64** (`uploadAs: "base64"`) il contenuto sta in `file.content` dentro il corpo JSON, fino a 10 MB.
- Il valore del campo diventa `{ name, type, size }` più la risposta del servizio (per esempio l'`id`). Senza `upload` il valore contiene anche `content` (base64, fino a 10 MB).
- La porta `DataClient` riceve il file in `DataRequest.file`; `HttpDataClient` lo invia come `FormData`.
- Il nome del file è sempre mostrato come testo.

### 2.9 Griglia a colonne nel form

`columns` (1–4) sul form e `span` sul campo (quante colonne occupa). Quando lo spazio è stretto (meno di 600 px di larghezza disponibile) il form torna a una colonna.

### 2.10 Righe ripetibili nel form

```json
{ "name": "righe", "type": "repeater", "minRows": 1, "maxRows": 20,
  "fields": [{ "name": "descrizione", "type": "text", "required": true }, { "name": "importo", "type": "number" }] }
```

Il valore è un elenco di oggetti. Ogni riga ha i propri campi (`text`, `number`, `select`, `checkbox`, `date`, `textarea`, `switch`, `lookup`, `file`; niente righe annidate) e un pulsante per toglierla; sotto c'è il pulsante per aggiungerne una. Obbligatorietà e regole di validazione valgono riga per riga; regole e data source dei campi della riga vedono la riga in `item`. Un form con righe ripetibili si allarga fino a 880 px.

### 2.11 Dialog con form

Nuovo passo `dialog`: apre una finestra con un form; i passi di `onSubmit` vedono i valori in `form`. Se riescono la finestra si chiude e la sequenza prosegue; se l'utente annulla la sequenza si ferma in silenzio (come `confirm`).

```json
{ "dialog": { "title": "{{ t('ordini.nota', 'Aggiungi una nota') }}",
  "fields": [{ "name": "testo", "type": "textarea", "required": true }],
  "initial": { "testo": "{{ row.note }}" },
  "submitLabel": "{{ t('comune.salva', 'Salva') }}",
  "onSubmit": [{ "call": "salvaNota", "args": { "id": "{{ row.id }}" } }] } }
```

La finestra è una nuova porta del core (`FormDialog`), implementata con il modal di NG-ZORRO; senza implementazione il passo non procede (fail-closed).

### 2.12 Tooltip nella scheda di dettaglio

I campi di `detail` con `tooltip` mostrano l'icona di aiuto accanto all'etichetta, come nei form.

### 2.13 Indicatori (KPI)

```json
{ "type": "stats", "source": "riepilogo",
  "items": [{ "label": "{{ t('cruscotto.fatturato', 'Fatturato') }}", "field": "fatturato", "format": "currency", "tone": "success" },
            { "label": "{{ t('cruscotto.da_incassare', 'Da incassare') }}", "value": "{{ state.totale }}", "format": "number" }] }
```

Una fila di riquadri con etichetta e valore grande. Il valore viene da un campo del data source (`field`) oppure da un'espressione (`value`), con gli stessi formati delle colonne. Si dispongono in griglia e vanno a capo sugli schermi stretti.

### 2.14 Procedura a passi (wizard)

```json
{ "type": "wizard", "bind": "state.passo",
  "steps": [{ "label": "Dati", "components": [...], "nextIf": "{{ state.cliente != null }}" },
            { "label": "Riepilogo", "components": [...] }] }
```

Indicatore dei passi in alto, contenuto del passo corrente, pulsanti Indietro e Avanti. Il passo corrente sta nello stato (`bind`), così anche un pulsante può spostarlo con `set`. Avanti è disabilitato finché `nextIf` non è vero. L'ultimo passo non ha Avanti: contiene di solito il form o il pulsante di conferma.

### 2.15 Vista ad albero

```json
{ "type": "tree", "source": "categorie", "keyField": "id", "labelField": "nome", "childrenField": "figli",
  "bind": "state.categoria", "searchable": true, "onSelect": [{ "toast": "{{ row.nome }}" }] }
```

Il data source restituisce i nodi radice con i figli annidati. La scelta di un nodo scrive la sua chiave nello stato (`bind`) ed esegue `onSelect` con il nodo in `row`. Con `searchable` compare un campo che evidenzia e apre i rami corrispondenti.

Da tastiera segue il modello WAI-ARIA «tree»: frecce su e giù tra i nodi visibili, destra apre il ramo o entra nel primo figlio, sinistra chiude il ramo o risale al genitore, Home e Fine, Invio o spazio scelgono; un solo nodo alla volta si raggiunge con Tab.

### 2.16 Calendario

```json
{ "type": "calendar", "source": "scadenze", "dateField": "data", "labelField": "titolo",
  "badgeField": "stato", "badges": { "scaduta": "danger", "pagata": "success" },
  "bind": "state.mese", "onSelect": [{ "navigate": "fattura-dettaglio", "params": { "id": "{{ row.id }}" } }] }
```

Vista mensile con gli eventi nei giorni (al massimo tre, poi «+n»). Cambiando mese il calendario scrive `AAAA-MM` nello stato `bind`, così il data source può caricare solo quel mese. Il clic su un evento esegue `onSelect` con l'evento in `row`.

### 2.17 Grafici

```json
{ "type": "chart", "kind": "bar", "stacked": true, "source": "vendite", "categoryField": "mese", "categoryFormat": "month",
  "series": [{ "field": "attive", "label": "Attive" }, { "field": "passive", "label": "Passive", "tone": "danger" },
             { "field": "margine", "label": "Margine", "kind": "line", "axis": "right" }],
  "format": "currency", "rightFormat": "percent", "height": 280 }
```

Tipi `bar`, `line` e `pie`, disegnati in SVG dalla piattaforma (nessuna libreria esterna) con i colori del tema. Le barre possono essere affiancate o impilate (`stacked`, i negativi verso il basso); una serie può stare su un secondo asse a destra (`axis: "right"`, formato `rightFormat`) e avere un suo tipo (`kind`), per grafici combinati come barre più una linea. Ogni grafico ha una legenda, i valori al passaggio del mouse e, per l'accessibilità, una tabella equivalente leggibile dagli screen reader.

### 2.18 Datatable

Tabella per analizzare in pagina un insieme di righe già caricato: ogni colonna può essere filtrata, ordinata e usata per raggruppare.

```json
{ "type": "dataTable", "source": "movimenti", "pageSize": 15, "groupBy": ["conto"],
  "columns": [
    { "field": "data", "format": "date", "sortable": true, "filter": "date" },
    { "field": "conto", "sortable": true, "filter": "select", "groupable": true },
    { "field": "categoria", "filter": "select", "groupable": true },
    { "field": "descrizione", "filter": "text" },
    { "field": "importo", "format": "currency", "sortable": true, "filter": "number", "aggregate": "sum" }] }
```

- **Filtri per colonna** dall'intestazione: `text` (contiene), `select` (scelta tra i valori presenti), `number` (da / a), `date` (intervallo). Un pulsante azzera tutti i filtri.
- **Ordinamento** su una colonna alla volta, come nella tabella.
- **Raggruppamento**: l'utente sceglie una o più colonne `groupable` (in ordine) da un selettore sopra la tabella; `groupBy` è la scelta iniziale. Ogni gruppo ha un'intestazione con il valore, il numero di righe e i totali delle colonne con `aggregate`; i gruppi si aprono e chiudono.
- Totale generale in fondo, paginazione in pagina (`pageSize`), azioni di riga come nella tabella.
- Filtri, ordinamento e gruppi lavorano sulle righe caricate. Si disegna solo la pagina corrente, i testi delle celle si calcolano una volta per riga e il filtro di testo aspetta 200 ms di pausa: con 20.000 righe, nel browser, ordinare richiede circa 20 ms e filtrare circa 40 ms oltre l'attesa. Per archivi da centinaia di migliaia di righe si usa `serverDataTable` (§ 2.19).

### 2.19 Datatable pilotata dal servizio

Stessa interfaccia della datatable (filtri dall'intestazione, ordinamento, scelta dei gruppi, totali, azioni di riga), ma il browser riceve solo la pagina e i gruppi visibili: tutto il calcolo è del servizio. Adatta ad archivi di centinaia di migliaia o milioni di righe.

```json
"dataSources": { "ricerca": { "type": "rest", "method": "POST", "url": "/api/movimenti/ricerca", "body": "{{ request }}" } },
...
{ "type": "serverDataTable", "source": "ricerca", "groupBy": ["conto"], "pageSize": 15,
  "defaultSort": { "field": "data", "direction": "desc" }, "bind": "state.ricercaMovimenti",
  "columns": [ ...come nella dataTable... ] }
```

**Richiesta.** La tabella esegue il data source con la variabile `request` (di solito tutto il corpo di una POST):

```json
{ "page": 0, "size": 15,
  "sort": { "field": "data", "direction": "desc" },
  "filters": [ { "field": "descrizione", "kind": "text", "text": "affitto" },
               { "field": "conto", "kind": "select", "values": ["Cassa"] },
               { "field": "importo", "kind": "number", "from": 100, "to": null },
               { "field": "data", "kind": "date", "from": "2026-01-01", "to": "2026-03-31" } ],
  "groupBy": ["conto"], "groupPath": [ { "field": "conto", "value": "Cassa" } ],
  "distinct": "categoria" }
```

- `groupPath` indica in quale gruppo aperto si sta leggendo; vuoto al primo livello.
- `distinct` c'è solo quando la tabella chiede i valori di un filtro a scelta: la risposta è `{ "values": [...] }`, calcolata con gli altri filtri applicati.

**Risposta.**
- Se `groupPath` è più corto di `groupBy`, il servizio risponde con i gruppi del livello successivo: `{ "groups": [ { "value": "Cassa", "count": 50000, "aggregates": { "importo": -1234.5 } } ], "total": 4, "totals": { "importo": ... } }`.
- Altrimenti risponde con le righe: `{ "items": [...], "total": 50000, "totals": { "importo": ... } }`.
- `total` è il numero di gruppi o di righe del livello (serve alla paginazione); `totals` sono i totali generali delle colonne con `aggregate`, mostrati in fondo.

**Comportamento.**
- Ordinamento, filtri e gruppi riportano alla prima pagina; il filtro di testo aspetta 300 ms di pausa. Una risposta arrivata dopo una più recente viene scartata.
- Un gruppo aperto carica le sue righe (o i sottogruppi) a pagine, con il pulsante «Mostra altre». Il passo `refresh` sul data source e il cambio pagina lasciano aperti i gruppi e ne ricaricano il contenuto fino al punto raggiunto.
- `bind` scrive nello stato `{ sort, filters, groupBy }`, utile per esportazioni o altre chiamate con gli stessi criteri.
- Il servizio deve controllare i campi ricevuti (solo colonne note in `sort`, `filters`, `groupBy`, `distinct`) e limitare `size`: la richiesta arriva dal browser e non è affidabile.

### 2.20 Campi a sé (input)

Un campo usato da solo, fuori da form e filtri: casella di testo, numero, elenco a discesa, scelta multipla, pulsanti di scelta, casella di spunta, interruttore, data, data e ora, ricerca (lookup), file, righe ripetibili. Il valore sta nello **stato della schermata**, quindi data source, espressioni, testi e passi lo leggono come ogni altro stato.

```json
{ "type": "input", "bind": "state.filtro.tipo", "default": "attiva",
  "field": { "name": "tipo", "type": "select", "label": "Tipo", "options": ["attiva", "passiva"], "optionKey": "valori.tipo" },
  "onChange": [ { "refresh": "fatture" } ] }
```

- `field` ha le stesse proprietà dei campi del form (tipo, etichetta, opzioni, `required`, `validate`, `readOnlyIf`, `lookup`, `upload`…). Form e campo a sé disegnano il controllo con lo stesso componente (`lc-field-control`).
- `bind` è il percorso nello stato; se manca vale `state.<nome del campo>`. Il runtime crea lo stato **prima** del primo caricamento dei data source: `default`, altrimenti falso per checkbox e switch e nullo per gli altri.
- Il testo libero (testo, numero, area di testo) si scrive nello stato quando si esce dal campo o con Invio, per non ricaricare i data source a ogni carattere; gli altri tipi a ogni scelta. Un campo svuotato vale `null`; i numeri arrivano come numeri.
- `onChange`: passi eseguiti dopo ogni modifica, con il nuovo valore in `value`.
- Errori di `required` e `validate` dopo la prima modifica. Il nodo accetta anche `enabledIf` e `readOnlyIf`, che si sommano a quelli del campo.
- Nella tavolozza dell'editor ogni tipo è una voce del gruppo «Campi» (Casella di testo, Elenco a discesa…); i nomi dei campi nuovi non si ripetono nella schermata.

Per affiancare più campi: una `section` con `layout: "row"` (larghezza da 200 a 360px ciascuno, a capo quando manca spazio) oppure un `box` o una `grid` (§ 2.21).

### 2.21 Contenitori di layout

Tre contenitori che decidono solo **dove** stanno i figli (nessun bordo né sfondo: per un riquadro con titolo c'è `section`). Le proprietà di posizione stanno sui **figli**, come i vincoli dei layout manager classici: così nell'editor si spostano i nodi nella struttura e si imposta la posizione nel pannello delle proprietà del figlio.

```text
 box (row)                  grid (columns: 3)          border
 ┌────┬──────────┬────┐     ┌──────────────┬─────┐     ┌──────────── north ───────────┐
 │ A  │ B grow 1 │ C  │     │ span 2       │     │     ├──────┬──────────────┬────────┤
 └────┴──────────┴────┘     ├──────────────┴─────┤     │ west │    center    │  east  │
                            │ span 3             │     ├──────┴──────────────┴────────┤
                            └────────────────────┘     └──────────── south ───────────┘
```

**Box** (`box`): figli in riga (`direction: "row"`, predefinito) o in colonna.
- `align`: allineamento trasversale (`start`, `center`, `end`, `stretch` predefinito); `justify`: distribuzione (`start`, `center`, `end`, `between`).
- `wrap`: in riga va a capo quando manca spazio (vero se assente).
- `gap`: `none`, `small`, `medium` (predefinito), `large`, ricavati da `--lc-gap` del tema.
- Figli: `grow` (0–12) divide lo spazio libero in proporzione; chi ha `grow` in una riga che va a capo non scende sotto i 200px.

```json
{ "type": "box", "justify": "between", "align": "center", "components": [
  { "type": "text", "style": "heading", "text": "Fatture" },
  { "type": "box", "gap": "small", "components": [ { "type": "button", ... }, { "type": "button", ... } ] } ] }
```

**Griglia** (`grid`): `columns` colonne uguali (2 se assente, fino a 12); i figli ne occupano `span` (mai più delle colonne). Sotto i 600px di larghezza del contenitore diventa una colonna sola.

**Border** (`border`): ogni figlio dichiara la `region`: `north` e `south` su tutta la larghezza, `west` ed `east` ai lati (`westWidth`, `eastWidth` in px, 240 se assenti), `center` (predefinita) prende il resto. Con `resizable: true` tra il centro e i lati ci sono divisori da trascinare (anche al tocco) o da spostare con le frecce (16px, con Maiusc 64px; Home e Fine ai limiti), tra 120 e 600px; sono accessibili (`role="separator"` con il valore corrente). Più figli nella stessa regione stanno uno sotto l'altro; una regione vuota non occupa spazio. Sotto i 768px di larghezza le regioni si impilano: nord, ovest, centro, est, sud.

```json
{ "type": "border", "westWidth": 220, "components": [
  { "type": "alert", "region": "north", "kind": "info", "text": "..." },
  { "type": "input", "region": "west", "field": { "name": "stato", "type": "radio", ... } },
  { "type": "table", "source": "fatture", "columns": [ ... ] } ] }
```

Regole comuni: un figlio nascosto (`visibleIf`) non occupa spazio; nei contenitori i campi riempiono la cella (fuori restano larghi al massimo 560px); le sezioni affiancate si allungano fino all'altezza della riga. I contenitori si annidano liberamente (un box dentro una regione del border, una griglia in una sezione…). Nell'editor sono nel gruppo «Struttura e testi»; il border nasce con tre aree d'esempio (nord, ovest, centro).

### 2.22 Passi validate, print ed export

```json
"onClick": [
  { "validate": "ordine" },
  { "call": "salva", "args": { "nome": "{{ state.nome }}" } },
  { "export": { "source": "fatture", "fileName": "fatture",
                "columns": [ { "field": "numero", "label": "{{ t('comune.numero', 'Numero') }}" }, { "field": "importo" } ] } },
  { "print": true }
]
```

- **validate**: controlla i campi a sé del gruppo indicato (`group` dei nodi `input`, `default` se non indicato; `*` = tutti quelli sullo schermo). Ogni campo mostra i propri errori; se uno non è valido compare l'avviso «Controlla i campi evidenziati» e la sequenza si ferma. Un campo nascosto non conta.
- **print**: apre la stampa del browser; il foglio di stampa del runtime nasconde menu, barra superiore, pulsanti e paginazione.
- **export**: esegue il data source (GET; `args` come in `call`) e scarica le righe (un elenco, oppure `items` di una risposta a pagine) in CSV per Excel in italiano: punto e virgola, righe CRLF, BOM UTF-8. Le intestazioni passano da `t()`; i valori sono quelli grezzi (numeri non formattati). Le celle che cominciano con `=`, `+`, `-`, `@` (o tabulazione e ritorno a capo) si fanno precedere da un apice: un foglio di calcolo non le esegue come formule. Il nome del file si ripulisce e prende `.csv`.

### 2.23 Immagine, collegamento, avanzamento

- **image**: `src` (relativo, `https://` o `data:image/png|jpeg|gif|webp|svg+xml;base64`; può contenere `{{ }}`), `alt` obbligatorio, `width`/`height` in px, `fit` (`contain` o `cover`). Ogni altro indirizzo (javascript:, http:, `//`, `..`) non si carica: si vede il testo alternativo, come quando l'immagine non si carica. Caricamento differito, nessun `Referer`.
- **link**: `label` e `screen` (+ `params`) per aprire una schermata dell'applicazione, **oppure** `href`: `https://…` (nuova scheda, `noopener noreferrer`, icona di collegamento esterno) o un percorso relativo (stessa scheda). Lo schema rifiuta gli altri protocolli e la presenza di entrambi.
- **progress**: `value` e `max` (100 se assente) numeri o espressioni, `label`, `kind` (`line` o `circle`), `tone`. Percentuale arrotondata tra 0 e 100; un valore non numerico mostra «—». Accessibile come `progressbar` con valore corrente.

### 2.24 Timeline e kanban

```json
{ "type": "timeline", "source": "eventi", "dateField": "data", "labelField": "titolo", "descriptionField": "nota",
  "toneField": "esito", "tones": { "ok": "success", "ko": "danger" }, "withTime": true }

{ "type": "kanban", "source": "attivita", "columnField": "stato", "titleField": "titolo", "descriptionField": "chi",
  "columns": [ { "value": "da-fare", "label": "Da fare" }, { "value": "fatto", "label": "Fatto", "tone": "success" } ],
  "moveIf": "{{ can('attivita.attivita.modifica') }}",
  "onMove": [ { "call": "sposta", "args": { "id": "{{ row.id }}", "stato": "{{ to }}" } }, { "refresh": "attivita" } ] }
```

- **timeline**: le righe del data source in ordine di data (`order`: `desc` predefinito, `asc`); una data senza ora vale come giorno locale; le righe senza data valida non si mostrano.
- **kanban**: colonne nell'ordine di `columns`, con conteggio; le righe con un valore che non è una colonna non si mostrano. Con `onMove` una scheda si sposta trascinandola in un'altra colonna oppure, da tastiera, con il pulsante «Sposta «…» in…» (menu delle altre colonne). I passi vedono `row`, `from` e `to`; la scheda cambia colonna quando i dati ricaricati lo dicono (lo spostamento vero è del servizio). `moveIf` decide per ogni riga, fail-closed.

### 2.25 Menu: ricerca, contatori, tastiera

- **Ricerca**: casella in cima al menu (barra espansa). Trova le voci del caso d'uso il cui nome, o quello del gruppo, contiene il testo, senza badare a maiuscole e accenti; ogni risultato mostra il percorso. Invio apre il primo, Freccia giù passa ai risultati, Esc pulisce.
- **Contatori**: nella navigazione `"badges": { "url": "/api/menu/contatori", "refreshSeconds": 60 }`. Il servizio (GET relativo, attraverso il BFF) risponde `{ "<id della voce>": numero }`; si tengono gli interi positivi, oltre 99 «99+», a barra compressa un pallino. Un gruppo chiuso mostra la somma dei contatori delle sue voci (anche dei sottogruppi); aperto, i numeri passano alle voci. Si rileggono a intervalli (solo con la pagina visibile) e al ritorno sulla pagina. I lettori di schermo leggono «Bozze, 3 da gestire».
- **Tastiera**: frecce su e giù tra voci e gruppi visibili, Home e Fine, destra apre un gruppo (o entra nella prima voce), sinistra lo chiude (o torna al gruppo), Invio e Spazio sui gruppi. I titoli dei gruppi si raggiungono con Tab e dicono se sono aperti (`aria-expanded`).

### 2.26 Testo formattato e editor di testo formattato

**Prima** i componenti testuali mostravano solo testo semplice: niente elenchi, grassetto o collegamenti, e il testo semplice perdeva perfino gli a capo. Ora:

- il testo semplice (`text` senza formato) rispetta gli a capo;
- `text` e `alert` con `"format": "markdown"`, e i campi del `detail` con `"format": "markdown"`, mostrano la **tipografia classica** scritta in un Markdown ristretto;
- il tipo di campo `richtext` è un editor di testo formattato con barra degli strumenti, nel form e come campo a sé.

```json
{ "type": "text", "format": "markdown",
  "text": "{{ t('ordini.istruzioni', 'Prima di **inviare**:\\n\\n- controlla i dati\\n- allega la fattura') }}" }
```

| Scrittura | Risultato |
| --- | --- |
| riga vuota | nuovo paragrafo (un a capo semplice resta un a capo) |
| `# `, `## `, `### ` | titoli (tre livelli, sotto il titolo della sezione) |
| `- ` (o `* `, `+ `), `1. ` | elenchi puntati e numerati; rientro di due spazi per annidare (fino a tre livelli) |
| `> ` | citazione |
| `**grassetto**`, `*corsivo*` (o `_corsivo_`), `~~barrato~~`, `` `codice` `` | enfasi |
| `[testo](https://…)` | collegamento: solo `https:`, `mailto:` o percorsi che cominciano con `/`; gli altri restano testo. Gli indirizzi esterni si aprono in una nuova scheda |
| `\*` | il carattere senza significato speciale |

**Sicurezza.** Il testo si analizza e si disegna con elementi costruiti dalla piattaforma: **mai HTML**. Un `<img onerror=…>` o uno `<script>` nel testo, anche se arriva dai dati o da una traduzione, si vede come testo. I collegamenti `javascript:`, `data:` e simili non diventano collegamenti. Il testo è limitato a 20.000 caratteri.

**Nelle tabelle** il formato di colonna `markdown` mostra il testo semplice (senza simboli); nella scheda di dettaglio è formattato.

**Editor `richtext`.** Barra con grassetto (Ctrl+B), corsivo (Ctrl+I), barrato, titolo, elenco puntato e numerato, citazione, collegamento e «togli la formattazione»; `rows` per l'altezza minima. Il valore è lo **stesso Markdown ristretto**, mai HTML: si mostra con un `text` o un campo di dettaglio `format: markdown`. Quello che il browser produce durante la modifica si riduce al formato ammesso (stili, script e tag sconosciuti spariscono); si incolla solo testo semplice; un collegamento si accetta solo con un indirizzo ammesso. L'area è un `textbox` multiriga con la sua etichetta; i pulsanti dicono se sono attivi (`aria-pressed`). Nella barra dei filtri `richtext` si comporta come `text`. La vetrina «Campi a sé» ha un esempio con l'anteprima accanto.

**Etichette.** Le etichette (dei campi, delle colonne, dei pulsanti, del menu) restano **testo semplice**, di proposito: sono brevi, vengono lette dai lettori di schermo come nome dell'elemento e devono restare uguali ovunque.

**Nelle traduzioni.** Dentro un'espressione CEL una stringa tra apici non può contenere a capo veri: nel testo di riserva di `t()` si scrive `\n` (nel JSON della schermata `\\n`). Nei file di traduzione gli a capo sono normali `\n` JSON.

## 3. Note di realizzazione e limiti noti

- **Caricamento dei data source.** Un data source GET si ricarica da solo solo se cambia la richiesta risolta (URL e parametri). Un cambiamento dello stato che non tocca la richiesta (una selezione, un passo della procedura, un nodo scelto) non provoca nuove chiamate; per ricaricare comunque si usa il passo `refresh`.
- **Espressioni prima dei dati.** Una variabile di stato che non esiste ancora fa fallire l'espressione, e l'errore finisce nelle segnalazioni tecniche: nelle condizioni si usa `has(state.x)`. Nelle mappe di parametri di `t()` con valori di tipo diverso serve `dyn(...)`; per i numeri formattati nella lingua si scrive `{n, number}`.
- **Variabili dei campi lookup e file.** Nei data source esistono sempre `search` e `lookupKey` (nulle finché non servono); `file` esiste nei data source di `upload`.
- **Lookup.** Il testo di un valore non caricato si risolve solo se il data source usa `{{ lookupKey }}`; altrimenti il campo mostra il valore stesso finché l'utente non cerca.
- **Righe ripetibili.** Niente righe annidate dentro una riga.
- **Datatable.** Lavora sulle righe caricate (provata fino a 50.000 righe nelle funzioni e 20.000 nel componente); oltre, `serverDataTable`.
- **Datatable lato server.** Niente selezione di righe né righe espandibili; i gruppi aperti non si ricordano tra una visita e l'altra della schermata. Il passo `refresh` su un data source non GET non chiama nulla: avvisa solo i componenti che lo interrogano da sé.
- **Grafici.** Niente zoom, aree riempite o più di due assi.
- **Campi a sé.** Per bloccare un'azione finché i campi non sono validi si usa il passo `validate` (§ 2.22); come sempre il controllo vero spetta al servizio.
- **Contenitori di layout.** Le larghezze scelte con i divisori valgono per la visita della schermata (non si ricordano); niente celle della griglia su più righe; soglie per impilare fisse (600px griglia, 768px border).
- **Kanban.** Niente riordino delle schede dentro una colonna né limiti per colonna; lo spostamento aspetta la risposta del servizio (nessun aggiornamento ottimistico).
- **Testo formattato.** Niente tabelle, immagini, colori o HTML; tre livelli di titolo e di elenco. L'editor usa i comandi di modifica del browser: il risultato si normalizza sempre al Markdown ristretto, ma la resa durante la scrittura può variare leggermente tra browser.
- **Esportazione.** Le righe sono quelle che il data source restituisce in una chiamata: per archivi a pagine il servizio deve offrire una lettura completa (o un'esportazione propria).

### 3.1 Limiti superati (ottobre 2026)

Dopo la prima consegna sono stati risolti: testo dei valori non caricati nel lookup (`lookupKey`); file in multipart fino a 100 MB; lookup e file nelle righe ripetibili; albero del tutto usabile da tastiera; datatable per decine di migliaia di righe e, lato server, per archivi di qualsiasi dimensione; barre impilate, asse destro e grafici combinati.
