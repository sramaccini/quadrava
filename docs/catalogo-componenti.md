# Catalogo dei componenti

Elenco dei componenti del linguaggio JSON: quelli già realizzati e quelli in costruzione, con la specifica che l'implementazione segue. Ogni componente nuovo ha test unitari nella libreria `components` e un esempio nella **vetrina** della demo (caso d'uso «Vetrina componenti»).

Regole comuni a tutti i componenti, valide anche per i nuovi:

- i testi passano da `{{ }}` e dal catalogo delle traduzioni (`t('chiave', 'ripiego')`); le scritte della piattaforma sono chiavi `lc.*` in italiano e inglese;
- nessun HTML da dati o traduzioni: i valori si mostrano sempre come testo;
- le espressioni sono **fail-closed**: se una condizione non si può valutare, il componente si nasconde o si disabilita;
- `visibleIf`, `hiddenIf`, `tooltip` valgono per ogni nodo (li applica il contenitore `lc-node`);
- colori e misure solo dal tema (`var(--lc-*)` o i token NG-ZORRO).

## 1. Realizzati

| Nodo / elemento | A cosa serve |
| --- | --- |
| `section` | Riquadro con titolo che raggruppa altri nodi. |
| `text` | Testo semplice o titolo (`style: heading`). |
| `button` | Pulsante che esegue una sequenza di passi (`onClick`). |
| `filterBar` | Barra di filtri che scrive nello stato della schermata (`bind`). |
| `table` | Tabella con paginazione lato server, formati di cella e azioni di riga. |
| `form` | Form con validazione, campi condizionali e azioni. |
| `tabs` | Schede, ognuna con i propri nodi. |
| `detail` | Scheda di dettaglio in sola lettura (etichetta e valore). |
| `alert` | Messaggio nella pagina (info, successo, errore). |
| Campi | `text`, `number`, `select`, `checkbox`, `date`. |
| Formati di cella | `text`, `currency`, `percent`, `date`, `datetime`, `boolean`, `badge`. |
| Passi | `set`, `call`, `refresh`, `navigate`, `toast`, `confirm`. |
| Guscio | Barra laterale (`lc-sidebar`), menu utente (`lc-user-menu`), barra superiore responsive. |

## 2. In costruzione

L'ordine è quello di realizzazione. Lo stato si aggiorna a ogni componente completato.

| # | Componente | Area | Stato |
| --- | --- | --- | --- |
| 1 | Ordinamento delle colonne | tabella | realizzato |
| 2 | Selezione delle righe e azioni multiple | tabella | realizzato |
| 3 | Menu delle azioni di riga | tabella | da fare |
| 4 | Righe di dettaglio espandibili | tabella | da fare |
| 5 | Formato numerico, celle cliccabili, riga dei totali | tabella | da fare |
| 6 | Nuovi tipi di campo: area di testo, data e ora, radio, interruttore, selezione multipla | campi | da fare |
| 7 | Campo con ricerca su data source (lookup) | campi | da fare |
| 8 | Caricamento di file | campi | da fare |
| 9 | Griglia a colonne nel form | form | da fare |
| 10 | Righe ripetibili nel form | form | da fare |
| 11 | Dialog con form (passo `dialog`) | azioni | da fare |
| 12 | Tooltip nella scheda di dettaglio | dettaglio | da fare |
| 13 | Indicatori (KPI) | visualizzazione | da fare |
| 14 | Procedura a passi (wizard) | layout | da fare |
| 15 | Vista ad albero | visualizzazione | da fare |
| 16 | Calendario | visualizzazione | da fare |
| 17 | Grafici | visualizzazione | da fare |
| 18 | Datatable con colonne filtrabili, ordinabili e raggruppabili | tabella | da fare |

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

Mentre l'utente scrive, il campo esegue il data source `source` (GET) con la variabile `search` (`"params": { "q": "{{ search }}" }`) e propone le righe restituite. Il valore del campo è `valueField`; il testo mostrato è `labelField`. Le ricerche ravvicinate si accorpano (attesa di 300 ms) e una risposta vecchia non sovrascrive una più recente.

### 2.8 Caricamento di file

```json
{ "name": "allegato", "type": "file", "accept": ".pdf,image/*", "maxSizeKb": 2048, "upload": "caricaAllegato" }
```

- Un solo file per campo; `accept` e `maxSizeKb` (massimo 10240) sono controllati prima di qualunque invio.
- Con `upload` il file viene inviato subito al data source (POST con `name`, `type`, `size`, `content` in base64) e il valore del campo diventa `{ name, type, size }` più la risposta del servizio (per esempio l'`id`). Senza `upload` il valore contiene anche `content`.
- Il nome del file è sempre mostrato come testo.

### 2.9 Griglia a colonne nel form

`columns` (1–4) sul form e `span` sul campo (quante colonne occupa). Quando lo spazio è stretto (meno di 600 px di larghezza disponibile) il form torna a una colonna.

### 2.10 Righe ripetibili nel form

```json
{ "name": "righe", "type": "repeater", "minRows": 1, "maxRows": 20,
  "fields": [{ "name": "descrizione", "type": "text", "required": true }, { "name": "importo", "type": "number" }] }
```

Il valore è un elenco di oggetti. Ogni riga ha i propri campi (solo tipi semplici: `text`, `number`, `select`, `checkbox`, `date`, `textarea`, `switch`) e un pulsante per toglierla; sotto c'è il pulsante per aggiungerne una. Obbligatorietà e regole di validazione valgono riga per riga.

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

### 2.16 Calendario

```json
{ "type": "calendar", "source": "scadenze", "dateField": "data", "labelField": "titolo",
  "badgeField": "stato", "badges": { "scaduta": "danger", "pagata": "success" },
  "bind": "state.mese", "onSelect": [{ "navigate": "fattura-dettaglio", "params": { "id": "{{ row.id }}" } }] }
```

Vista mensile con gli eventi nei giorni (al massimo tre, poi «+n»). Cambiando mese il calendario scrive `AAAA-MM` nello stato `bind`, così il data source può caricare solo quel mese. Il clic su un evento esegue `onSelect` con l'evento in `row`.

### 2.17 Grafici

```json
{ "type": "chart", "kind": "bar", "source": "vendite", "categoryField": "mese",
  "series": [{ "field": "attive", "label": "Attive" }, { "field": "passive", "label": "Passive" }],
  "format": "currency", "height": 280 }
```

Tipi `bar`, `line` e `pie`, disegnati in SVG dalla piattaforma (nessuna libreria esterna) con i colori del tema. Ogni grafico ha una legenda, i valori al passaggio del mouse e, per l'accessibilità, una tabella equivalente leggibile dagli screen reader.

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
- Filtri, ordinamento e gruppi lavorano sulle righe caricate: è pensata per insiemi fino a qualche migliaio di righe; per volumi maggiori si usa `table` con paginazione e filtri lato server.
