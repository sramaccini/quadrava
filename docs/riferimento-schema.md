# Riferimento dello schema delle schermate di KinetiX

> Generato da `frontend/tools/schema-docs.mjs` a partire da `screen.schema.json`: non modificare a mano. Dopo una modifica allo schema: `npm run schema:docs`. Le proprietà con * sono obbligatorie. Le spiegazioni con esempi sono nel [catalogo dei componenti](catalogo-componenti.md).

## Proprietà comuni a tutti i componenti

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `id` | id | Identificativo in kebab-case. Una volta pubblicato non cambia. |
| `visibleIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `hiddenIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `enabledIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `readOnlyIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `tooltip` | testo | Testo di aiuto mostrato al passaggio del mouse o con il focus. Solo testo (mai HTML); può contenere {{ }}. |
| `grow` | intero 0–12 | Dentro un box: quota dello spazio libero che il componente prende rispetto ai fratelli (0 o assente = solo lo spazio che gli serve). |
| `span` | intero 1–12 | Dentro una griglia: colonne occupate (1 se assente, mai più di quelle della griglia). |
| `region` | `north`, `south`, `west`, `east`, `center` | Dentro un border: la regione del componente (center se assente). Più componenti nella stessa regione stanno uno sotto l’altro. |

## Componenti

### `section`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `title` | testo | Titolo della sezione, mostrato in testa; può contenere {{ }}, per esempio un testo tradotto. |
| `components` * | elenco di componente | Componenti contenuti nella sezione, disposti secondo layout. |
| `layout` | `column`, `row` | Disposizione dei componenti: uno sotto l’altro (column, predefinito) o affiancati e a capo quando manca spazio (row), per esempio più campi in una riga. |

### `text`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `text` * | testo | Testo da mostrare; può contenere {{ }}. Mai HTML. |
| `style` | `heading`, `body` | heading: titolo; body: testo normale (predefinito). |
| `format` | `plain`, `markdown` | plain (predefinito): testo semplice. markdown: testo formattato con il Markdown ristretto di KinetiX: paragrafi, titoli (#, ##, ###), elenchi puntati (-) e numerati (1.) anche annidati, citazioni (>), **grassetto**, *corsivo*, ~~barrato~~, `codice`, [collegamenti](https://…). Mai HTML: anche un testo che arriva dai dati è sicuro. |

### `button`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `label` * | testo | Testo del pulsante; può contenere {{ }}. |
| `onClick` * | elenco di passo | Passi eseguiti al clic, in ordine (call, set, navigate, refresh…). Il pulsante resta occupato finché finiscono. |

### `filterBar`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `bind` * | testo | Percorso nello stato della schermata, per esempio state.filtri. |
| `fields` * | elenco di field | Campi dei filtri: ognuno scrive il valore nello stato `bind`, sotto il proprio nome (per esempio state.filtri.stato). textarea e richtext diventano testo su una riga. |

### `table`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Nome del data source che fornisce le righe. |
| `columns` * | elenco di tableColumn | Colonne della tabella, in ordine: campo, intestazione, formato. |
| `rowActions` | elenco di action | Azioni su una riga, nell’ultima colonna: le espressioni vedono la riga come `row`. |
| `sort` | oggetto | Ordinamento. Con paging server lo fa il servizio: la tabella scrive { field, direction } nello stato `bind`; altrimenti ordina in pagina le righe caricate. |
| `selection` | oggetto | Selezione delle righe: le chiavi delle righe scelte stanno nello stato `bind`; le azioni multiple vedono le righe intere in `selection`. |
| `bulkActions` | elenco di action | Azioni sulle righe selezionate, sopra la tabella. Le espressioni vedono `selection` (elenco delle righe scelte). |
| `rowActionsInline` | intero 0–10 | Quante azioni di riga (visibili) mostrare come pulsanti; le altre finiscono nel menu «⋯». 0 = tutte nel menu; se manca, tutte pulsanti. |
| `expand` | oggetto | Area che si apre sotto la riga: i nodi vedono la riga come `row`. I data source sono della schermata: dentro l'area si usano i valori di `row`. |
| `refreshable` | sì/no | Pulsante «Aggiorna» nel piede della tabella, a sinistra (le pagine sono a destra): ricarica il data source come il passo refresh. Assente se false o non indicato. |

### `form`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` | testo | Nome del data source che fornisce i valori iniziali (assente nei form di inserimento). |
| `initial` | oggetto | Valori iniziali con espressioni, risolti una sola volta all'apertura; per esempio {"tipo": "{{params.tipo}}"}. |
| `fields` * | elenco di field | Campi del form, in ordine. I valori si leggono come `form` nelle espressioni. |
| `actions` | elenco di action | Pulsanti sotto i campi: al clic il form controlla i campi visibili e, se sono validi, esegue i passi, che vedono i valori in `form`. |
| `columns` | intero 1–4 | Colonne della griglia dei campi (1 se assente). Con poco spazio il form torna a una colonna. |

### `tabs`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `tabs` * | elenco di tab | Schede, in ordine: etichetta e componenti. Una scheda con visibleIf falso non compare; i valori non si perdono cambiando scheda. |

### `detail`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `title` | testo | Titolo del riquadro; può contenere {{ }}. |
| `source` * | testo | Nome del data source che restituisce un solo record (un oggetto). |
| `fields` * | elenco di column | Campi del record da mostrare, in ordine: campo, etichetta, formato. |

### `alert`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `text` * | testo | Testo del messaggio; può contenere {{ }}. |
| `kind` | `info`, `success`, `error` | Aspetto del messaggio; info se assente. |
| `format` | `plain`, `markdown` | plain (predefinito): testo semplice. markdown: testo formattato con il Markdown ristretto di KinetiX: paragrafi, titoli (#, ##, ###), elenchi puntati (-) e numerati (1.) anche annidati, citazioni (>), **grassetto**, *corsivo*, ~~barrato~~, `codice`, [collegamenti](https://…). Mai HTML: anche un testo che arriva dai dati è sicuro. |

### `stats`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` | testo | Data source che restituisce un record (oggetto) con i valori; facoltativo se tutti gli indicatori usano value. |
| `items` * | elenco di statItem | Indicatori da mostrare affiancati (da 1 a 8), ognuno con etichetta e valore. |

### `wizard`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `bind` | percorso nello stato | Stato con l’indice del passo corrente (da 0): anche un pulsante può spostarlo con set. |
| `steps` * | elenco di wizardStep | Passi della procedura guidata (da 2 a 10), ognuno con etichetta e componenti; si mostra un passo alla volta. |
| `nextLabel` | testo | Testo del pulsante per il passo successivo («Avanti» se assente); può contenere {{ }}. |
| `backLabel` | testo | Testo del pulsante per il passo precedente («Indietro» se assente); può contenere {{ }}. |

### `tree`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Data source che restituisce i nodi radice, con i figli annidati. |
| `keyField` | testo | Campo che identifica il nodo (id se assente). |
| `labelField` * | testo | Campo mostrato come testo del nodo. |
| `childrenField` | testo | Campo con i figli (children se assente). |
| `bind` | percorso nello stato | Stato in cui scrivere la chiave del nodo scelto. |
| `searchable` | sì/no | Mostra un campo di ricerca che evidenzia i nodi e apre i rami corrispondenti. |
| `expandAll` | sì/no | Tutti i rami aperti all’inizio (solo il primo livello se assente). |
| `onSelect` | elenco di passo | Passi eseguiti alla scelta di un nodo, che vedono il nodo in `row`. |

### `calendar`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Data source con gli eventi (un elenco di righe). |
| `dateField` * | testo | Campo con la data dell’evento (AAAA-MM-GG, anche con l’ora). |
| `labelField` * | testo | Campo mostrato come testo dell’evento. |
| `badgeField` | testo | Campo che decide il colore dell’evento secondo `badges`. |
| `badges` | oggetto | Colore degli eventi per valore di `badgeField`, per esempio {"urgente": "danger"}; i valori non elencati sono primary. |
| `bind` | percorso nello stato | Stato con il mese visibile (AAAA-MM), da usare nei parametri del data source. |
| `maxPerDay` | intero 1–10 | Eventi mostrati per giorno; gli altri diventano «+n» (3 se assente). |
| `onSelect` | elenco di passo | Passi eseguiti al clic su un evento, che vedono l’evento in `row`. |

### `chart`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `kind` * | `bar`, `line`, `pie` | Barre, linee o torta (la torta usa la prima serie). |
| `source` * | testo | Data source con le righe (una per categoria). |
| `categoryField` * | testo | Campo con la categoria (asse orizzontale o fetta). |
| `categoryFormat` | `text`, `date`, `month` | Come mostrare la categoria: testo, data (AAAA-MM-GG) o mese (AAAA-MM). |
| `categoryKey` | testo | Prefisso delle chiavi di traduzione delle categorie (t('<prefisso>.<valore>')). |
| `series` * | elenco di chartSeries | Serie di valori da disegnare (da 1 a 6), ognuna da un campo numerico delle righe. |
| `format` | `number`, `currency`, `percent` | Formato dei valori (number se assente). |
| `currency` | testo | Codice ISO 4217 per format currency (EUR se assente). |
| `decimals` | intero 0–6 | Decimali mostrati con format number (fino a 2 se assente). |
| `height` | intero 160–600 | Altezza in pixel (280 se assente). |
| `caption` | testo | Didascalia della tabella equivalente letta dagli screen reader. |
| `stacked` | sì/no | Barre impilate invece che affiancate (i valori negativi si impilano verso il basso). |
| `rightFormat` | `number`, `currency`, `percent` | Formato dei valori dell’asse destro (come format se assente). |

### `dataTable`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Data source con le righe da analizzare in pagina (tutte caricate: niente paginazione lato server). |
| `columns` * | elenco di dataColumn | Colonne della tabella, in ordine: campo, intestazione, formato, e se si possono ordinare, filtrare, raggruppare o totalizzare. |
| `groupBy` | elenco di testo | Colonne di raggruppamento iniziali (groupable), in ordine. |
| `defaultSort` | sortSpec | Ordinamento iniziale (campo e direzione); poi lo cambia l’utente dalle intestazioni. |
| `pageSize` | intero 5–100 | Elementi per pagina, intestazioni dei gruppi comprese (10 se assente). |
| `rowActions` | elenco di action | Azioni su una riga, nell’ultima colonna: le espressioni vedono la riga come `row`. |
| `rowActionsInline` | intero 0–10 | Quante azioni di riga (visibili) mostrare come pulsanti; le altre finiscono nel menu «⋯». 0 = tutte nel menu; se manca, tutte pulsanti. |
| `refreshable` | sì/no | Pulsante «Aggiorna» nel piede della tabella, a sinistra (le pagine sono a destra): ricarica il data source come il passo refresh. Assente se false o non indicato. |

### `serverDataTable`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Data source di ricerca (di solito POST con "body": "{{ request }}") che riceve pagina, ordinamento, filtri e gruppi e restituisce solo ciò che serve: { items, total, totals } per le righe, { groups: [{ value, count, aggregates }], total, totals } per i gruppi, { values } per i valori di un filtro a scelta. |
| `columns` * | elenco di dataColumn | Colonne della tabella, in ordine: campo, intestazione, formato, e se si possono ordinare, filtrare, raggruppare o totalizzare (lo fa il servizio). |
| `groupBy` | elenco di testo | Colonne di raggruppamento iniziali (groupable), in ordine. |
| `defaultSort` | sortSpec | Ordinamento iniziale (campo e direzione), inviato al servizio; poi lo cambia l’utente dalle intestazioni. |
| `pageSize` | intero 5–200 | Righe (o gruppi) per pagina e righe caricate a ogni «mostra altre» dentro un gruppo (20 se assente). |
| `bind` | percorso nello stato | Stato in cui la tabella scrive la richiesta corrente (senza pagina), per altri componenti, per esempio un pulsante di esportazione. |
| `rowActions` | elenco di action | Azioni su una riga, nell’ultima colonna: le espressioni vedono la riga come `row`. |
| `rowActionsInline` | intero 0–10 | Quante azioni di riga (visibili) mostrare come pulsanti; le altre finiscono nel menu «⋯». 0 = tutte nel menu; se manca, tutte pulsanti. |
| `refreshable` | sì/no | Pulsante «Aggiorna» nel piede della tabella, a sinistra (le pagine sono a destra): ricarica il data source come il passo refresh. Assente se false o non indicato. |

### `input`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `field` * | field | Il campo da mostrare, con le stesse proprietà dei campi del form (tipo, etichetta, opzioni, obbligatorietà, regola di validazione, lookup, file…). Il nome identifica il campo e, senza `bind`, il valore nello stato. |
| `bind` | percorso nello stato | Stato in cui il campo legge e scrive il valore (state.<nome del campo> se assente). I data source che lo usano si ricaricano quando cambia. |
| `default` |  | Valore iniziale, se lo stato non ne ha già uno (nullo se assente; falso per checkbox e switch). I testi possono contenere {{ }}, per esempio un testo tradotto. |
| `onChange` | elenco di passo | Passi eseguiti dopo ogni modifica del valore, che vedono il nuovo valore in `value`. Il testo libero si scrive nello stato quando si esce dal campo o con Invio. |
| `group` | testo | Gruppo di validazione: il passo { "validate": "<gruppo>" } controlla insieme i campi dello stesso gruppo. |

### `box`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `components` * | elenco di componente | Componenti contenuti, disposti secondo direction; ognuno può allargarsi con grow. |
| `direction` | `row`, `column` | row: affiancati (predefinito); column: uno sotto l’altro. |
| `gap` | gap | Spazio tra i componenti, ricavato dal tema (medium se assente). |
| `align` | `start`, `center`, `end`, `stretch` | Allineamento sull’asse trasversale: in riga è quello verticale (stretch se assente, end per allineare campi di altezza diversa). |
| `justify` | `start`, `center`, `end`, `between` | Distribuzione sull’asse principale (start se assente; between = primo e ultimo agli estremi). |
| `wrap` | sì/no | In riga, va a capo quando manca spazio (vero se assente). |

### `grid`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `components` * | elenco di componente | Componenti contenuti, uno per cella e a capo dopo l’ultima colonna; ognuno può occupare più colonne con span. |
| `columns` | intero 1–12 | Colonne della griglia (2 se assente). Sotto i 600px di larghezza diventa una colonna sola. |
| `gap` | gap | Spazio tra i componenti, ricavato dal tema (medium se assente). |

### `border`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `components` * | elenco di componente | Componenti contenuti, ognuno nella regione indicata da region (north, west, center, east, south; center se assente). |
| `westWidth` | intero 120–600 | Larghezza in px della regione west (240 se assente). |
| `eastWidth` | intero 120–600 | Larghezza in px della regione east (240 se assente). |
| `gap` | gap | Spazio tra i componenti, ricavato dal tema (medium se assente). |
| `resizable` | sì/no | Divisori tra il centro e i lati ovest ed est, da trascinare o da spostare con le frecce (da 120 a 600px). |

### `image`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `src` * | testo | Indirizzo dell’immagine: relativo (/img/logo.png), https:// oppure data:image/…; può contenere {{ }}. Qualunque altro indirizzo non si mostra. |
| `alt` * | testo | Testo alternativo (obbligatorio per l’accessibilità); si mostra anche se l’immagine non si carica. |
| `width` | intero 16–2000 | Larghezza massima in px (si adatta allo spazio disponibile). |
| `height` | intero 16–2000 | Altezza in px. |
| `fit` | `contain`, `cover` | Con larghezza e altezza: contain mostra tutta l’immagine, cover riempie ritagliando (contain se assente). |

### `link`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `label` * | testo | Testo del collegamento; può contenere {{ }}. |
| `screen` | testo | Schermata da aprire nell’applicazione (con params). |
| `params` | oggetto | Parametri della schermata; i valori possono contenere {{ }}. |
| `href` | testo | Indirizzo esterno https:// (si apre in una nuova scheda, senza accesso a questa) o percorso relativo. Mai javascript: o altri protocolli. |

### `progress`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `value` * | testo o numero | Valore raggiunto, un numero o un’espressione (per esempio {{ row.completate }}). |
| `max` | testo o numero | Valore che corrisponde al 100% (100 se assente); numero o espressione. |
| `label` | testo | Etichetta mostrata sopra la barra; può contenere {{ }}. |
| `kind` | `line`, `circle` | Barra (line, predefinita) o cerchio. |
| `tone` | tone | Colore della barra, preso dal tema (primary se assente). |

### `timeline`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Data source con gli eventi (un elenco di righe). |
| `dateField` * | testo | Campo con la data (AAAA-MM-GG, anche con l’ora). |
| `labelField` * | testo | Campo mostrato come titolo dell’evento. |
| `descriptionField` | testo | Campo mostrato sotto il titolo. |
| `toneField` | testo | Campo che decide il colore secondo tones. |
| `tones` | oggetto | Colore degli eventi per valore di `toneField`, per esempio {"errore": "danger"}; i valori non elencati sono primary. |
| `order` | `desc`, `asc` | Dal più recente (desc, predefinito) o dal più vecchio. |
| `withTime` | sì/no | Mostra anche l’ora. |

### `kanban`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `source` * | testo | Data source con le schede (un elenco di righe). |
| `columnField` * | testo | Campo della riga che decide la colonna (per esempio stato). |
| `titleField` * | testo | Campo mostrato come titolo della scheda. |
| `descriptionField` | testo | Campo mostrato sotto il titolo della scheda. |
| `columns` * | elenco di oggetto | Colonne della bacheca, in ordine: value è il valore di `columnField`, label l’intestazione (può contenere {{ }}), tone il colore (neutral se assente). |
| `moveIf` | espressione | Condizione per spostare una scheda (vede la riga in row), per esempio un permesso. |
| `onMove` | elenco di passo | Passi per spostare una scheda (di solito call e refresh): vedono la riga in row, la colonna di partenza in from e quella di arrivo in to. |

## Passi delle azioni

### `call`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `call` * | testo | Nome del data source da eseguire. |
| `args` | oggetto |  |
| `onError` | steps | Passi eseguiti se la chiamata non riesce (al posto del messaggio predefinito). Vedono error.status: il codice HTTP della risposta (0 se il servizio non è raggiungibile), per esempio {{ error.status == 409 }}. Il messaggio del server non c'è: potrebbe contenere dettagli interni. |
| `as` |  | Nome con cui i passi successivi della stessa sequenza vedono la risposta del servizio, per esempio "creato" e poi {{ creato.id }}. Non può essere il nome di una variabile già esistente (user, state, params, row, form, error…). |

### `refresh`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `refresh` * | testo | Nome del data source da ricaricare. |

### `navigate`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `navigate` * | id | Identificativo in kebab-case. Una volta pubblicato non cambia. |
| `params` | oggetto |  |

### `toast`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `toast` * | testo |  |

### `set`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `set` * | oggetto |  |

### `confirm`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `confirm` * | testo | Domanda posta all'utente prima di proseguire; può contenere espressioni, per esempio "Approvare l'ordine {{row.numero}}?". Se l'utente rinuncia la sequenza si ferma, senza messaggi di errore. |

### `dialog`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `dialog` * | oggetto | Finestra con un form: i passi di onSubmit vedono i valori in `form`. Se riescono la finestra si chiude e la sequenza prosegue; se l’utente annulla la sequenza si ferma in silenzio. |

### `validate`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `validate` * | testo | Gruppo di campi a sé (`group` dei nodi input) da controllare, oppure * per tutti quelli visibili. Se un campo non è valido gli errori si mostrano e la sequenza si ferma. |

### `print`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `print` * | `true` | Apre la stampa del browser: menu, barre e pulsanti non si stampano. |

### `export`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `export` * | oggetto | Scarica in CSV le righe di un data source GET (un elenco, oppure items di una risposta a pagine): separatore punto e virgola, UTF-8 con BOM per Excel, celle che cominciano con = + - @ neutralizzate. |

### `if`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `if` * | espressione | Condizione, per esempio {{ creato.stato == 'bozza' }}. Se non si può valutare la sequenza si ferma (non si esegue nessuno dei due rami). |
| `then` * | steps | Passi se la condizione è vera. |
| `else` | steps | Passi se la condizione è falsa. |

### `run`

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `run` * | identifier | Nome della sequenza in actions. |

## Campi (form, filtri, campi a sé)

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `name` * | testo |  |
| `type` * | `text`, `number`, `select`, `checkbox`, `date`, `textarea`, `datetime`, `radio`, `switch`, `multiselect`, `lookup`, `file`, `repeater`, `richtext` | Tipo di campo. textarea: testo su più righe (`rows`); datetime: data e ora AAAA-MM-GGTHH:mm (ora locale); radio: scelta tra `options`; switch: interruttore vero/falso; multiselect: elenco di valori di `options`. lookup: valore scelto tra le righe di un data source cercate mentre si scrive (`lookup`). file: un file scelto dall’utente (`accept`, `maxSizeKb`, `upload`). repeater: elenco di righe, ognuna con i campi di `fields` (`minRows`, `maxRows`, `addLabel`). richtext: testo formattato scritto con una barra degli strumenti (grassetto, corsivo, titoli, elenchi, citazioni, collegamenti); il valore è Markdown ristretto, mai HTML (`rows` per l’altezza). |
| `label` | testo |  |
| `required` | sì/no |  |
| `options` | elenco di testo |  |
| `sensitive` | sì/no | Il valore non compare mai in tracce e log. |
| `visibleIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `hiddenIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `readOnlyIf` | espressione | Espressione CEL tra doppie graffe, per esempio {{can('ordini.ordine.approva') && row.stato == 'inviato'}}. Variabili disponibili: user, state, params, row, form, value. Funzione disponibile: can(permesso). |
| `validate` | oggetto |  |
| `tooltip` | testo | Testo di aiuto mostrato al passaggio del mouse o con il focus. Solo testo (mai HTML); può contenere {{ }}. |
| `optionKey` | testo | Prefisso delle chiavi di traduzione per le etichette delle opzioni: l'etichetta di un'opzione è t('<prefisso>.<valore>'), con il valore come ripiego. |
| `rows` | intero 2–20 | Righe visibili di un campo textarea (4 se assente). |
| `lookup` | oggetto | Per type lookup: data source GET da interrogare con la variabile `search` (per esempio "params": { "q": "{{ search }}" }). |
| `accept` | testo | Per type file: estensioni (.pdf) e tipi MIME (image/*, application/pdf) ammessi, separati da virgole. |
| `maxSizeKb` | intero 1–102400 | Per type file: dimensione massima in KB (1024 se assente). Fino a 102400 con invio multipart; il contenuto in base64 è limitato a 10240. |
| `upload` | testo | Per type file: data source (POST) a cui inviare subito il file. In multipart il file è la parte "file" della richiesta e la variabile `file` ha name, type e size; in base64 ha anche content. |
| `span` | intero 1–4 | Colonne occupate dal campo nella griglia del form (1 se assente). |
| `fields` | elenco di valori | Per type repeater: i campi di ogni riga (text, number, select, checkbox, date, textarea, switch, lookup, file; niente righe annidate). Le regole di validazione vedono la riga in `item`. |
| `minRows` | intero 0–50 | Per type repeater: righe minime (0 se assente). |
| `maxRows` | intero 1–200 | Per type repeater: righe massime (50 se assente). |
| `addLabel` | testo | Per type repeater: testo del pulsante che aggiunge una riga. |
| `uploadAs` | `multipart`, `base64` | Per type file con upload: multipart (il file viaggia come file, variabile `file` con name, type e size; predefinito) oppure base64 (il contenuto in `file.content` dentro il corpo JSON). |

## Data source

| Proprietà | Tipo | Descrizione |
| --- | --- | --- |
| `type` * | `"rest"` |  |
| `method` * | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |  |
| `url` * | testo |  |
| `params` | oggetto | Parametri di query (GET, DELETE). |
| `body` |  | Corpo della richiesta (POST, PUT, PATCH): un oggetto con espressioni oppure una sola espressione, per esempio {{form}}. Se manca si usa params. |
| `paging` | `server`, `none` |  |
