# Editor visuale delle schermate

L'editor (`frontend/projects/editor`) produce lo stesso JSON che il runtime legge: chi lo usa compone la schermata con tavolozza, struttura e pannello delle proprietà, e vede subito il risultato disegnato dal runtime vero. Non esiste un formato intermedio: quello che si esporta si mette in `examples/` (o, in futuro, si pubblica nel registro) così com'è.

Avvio: `cd frontend && npm run start:editor` (porta 4201; costruisce le librerie e copia gli esempi).

## 1. Com'è fatto

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Editor  [Nuova] [Apri esempio] [Importa] [Esporta]  [↶] [↷] [Incolla]  Valida│
├───────────────┬──────────────────────────────────────────┬───────────────────┤
│ COMPONENTI    │ Anteprima | JSON | Data source           │ PROPRIETÀ         │
│ Sezione Testo │ [Desktop|Tablet|Telefono] [Permessi] …   │ Tabella           │
│ Tabella …     │ ┌──────────────────────────────────────┐ │ id     tabella-1  │
│               │ │  la schermata, disegnata dal runtime │ │ source elenco ▾   │
│ STRUTTURA     │ │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  (nodo       │ │ columns           │
│ Schermata     │ │  │  nodo selezionato   │  evidenziato)│ │  ▸ Id (id)        │
│  Sezione      │ │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘              │ │  ▾ Descrizione    │
│   Tabella ↑↓⧉✂🗑│ └──────────────────────────────────────┘ │     field …       │
├───────────────┴──────────────────────────────────────────┴───────────────────┤
│ Problemi (0)                                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Tavolozza.** Un clic aggiunge il componente nel punto di inserimento: dentro il contenitore selezionato (schermata, sezione, scheda, passo), altrimenti subito dopo il nodo selezionato. In alternativa lo si trascina nella struttura. Ogni componente nasce da un modello valido; se usa un data source (`source`) e questo manca, l'editor lo crea (GET `/api/<nome>`, POST con `{{ request }}` per la datatable lato server).
- **Struttura.** L'albero dei nodi, con schede e passi. Il nodo selezionato mostra i comandi sposta su/giù, duplica (identificativi nuovi), taglia, elimina; tabs e wizard anche «aggiungi scheda/passo». I nodi si trascinano prima, dopo o dentro un'altra riga. Un pallino rosso o giallo segnala errori o avvisi del nodo.
- **Proprietà.** I campi dell'elemento selezionato, generati dallo schema JSON (§ 2). Le condizioni (`visibleIf`, `hiddenIf`, `enabledIf`, `readOnlyIf`, `nextIf`) e il tooltip stanno in un gruppo a parte, aperto solo se ne è impostata una.
- **Anteprima.** La schermata disegnata da `lc-screen` con porte proprie (§ 3). Il nodo selezionato è evidenziato da un riquadro tratteggiato (se sta in una scheda nascosta, l'anteprima apre quella scheda); Alt+clic su un componente, o un clic in modalità «Seleziona», lo seleziona invece di attivarlo.
- **JSON.** Il documento intero, modificabile a mano; «Applica» lo sostituisce in un solo passo annullabile, il testo non valido non tocca nulla.
- **Data source.** Metodo, URL, parametri, corpo e paginazione di ogni data source; rinominarlo aggiorna i nodi (`source`) e i passi (`call`, `refresh`) che lo usano. Accanto, i **dati di esempio** che l'anteprima restituisce al posto del servizio.
- **Testi.** Tutti i testi che l'utente legge (titoli, etichette, messaggi, tooltip, conferme…), con dove stanno. Un testo semplice non cambia con la lingua: «Rendi traducibile» lo sostituisce con `{{ t('schermata.chiave', 'Testo') }}` (chiave dal prefisso della schermata e dalle prime parole, unica) e lo usa come traduzione italiana. Per ogni chiave si scrivono le traduzioni italiana e inglese, che valgono subito nell'anteprima; le traduzioni mancanti sono segnalate e contate nel titolo della scheda. «Esporta traduzioni» scarica `<schermata>.i18n.json` (`{ "it": {…}, "en": {…} }`) da unire ai cataloghi `examples/i18n/<lingua>.json`. I testi con graffe (parametri dei messaggi) e le espressioni più complesse si rendono traducibili a mano.
- **Problemi.** Errori di schema, espressioni CEL non valide, identificativi ripetuti (errori) e data source non definiti (avvisi). Un clic porta all'elemento. Con errori l'anteprima resta all'ultima versione valida.

La bozza (documento, dati di esempio e traduzioni scritte nell'editor) si salva da sola nel browser a ogni modifica e si riprende alla riapertura. «Apri esempio» offre le schermate di `examples/` (l'elenco `examples/index.json` lo scrive `tools/copy-examples.mjs`); «Importa» ed «Esporta» leggono e scrivono un file `.json`.

## 2. Pannello delle proprietà generato dallo schema

L'editor non ha un elenco proprio delle proprietà dei componenti: le legge da `screen.schema.json` (`model/schema-info.ts`). Così un componente o una proprietà nuova compare da sola nell'editor; basta aggiungere il modello iniziale in `model/templates.ts` e il nome nella tavolozza (un test fallisce se un tipo dello schema non ha modello valido o non è nella tavolozza).

| Nello schema | Nel pannello |
| --- | --- |
| `enum` | scelta (vuota = proprietà assente, se facoltativa) |
| `$ref: expression` | area di testo con `{{ … }}` |
| `string` | testo; area di testo per testi lunghi e per ogni valore con `{{ }}`; `source`, `call`, `refresh` suggeriscono i data source, `navigate` le schermate note |
| `boolean` | casella (deselezionata = proprietà assente) |
| `integer` / `number` | numero con minimo e massimo dello schema |
| oggetto chiuso (`sort`, `selection`, `lookup`, `dialog`…) | gruppo di campi, «Imposta» / «Togli» se facoltativo |
| elenco di oggetti (`columns`, `fields`, `rowActions`, `items`, `series`…) | elementi apribili uno per uno, con sposta, elimina, aggiungi; vista JSON dell'elenco |
| elenco di passi (`onClick`, `onSubmit`, `onSelect`) | come sopra, e «Aggiungi» chiede la variante: `call`, `refresh`, `navigate`, `toast`, `set`, `confirm`, `dialog` |
| elenco di nodi (`components`) | non nel pannello: si gestisce nella struttura |
| mappe libere (`params`, `initial`, `badges`, `args`) e il resto | JSON |

Le colonne ereditano i campi da più definizioni (`columnProps` → `tableColumnProps` → `dataColumn`): l'editor segue `$ref` e unisce le proprietà, quindi una colonna di datatable mostra anche `filter` e `groupable`.

Un testo vuoto toglie la proprietà facoltativa; quella obbligatoria resta vuota e la validazione la segnala. Esempio: nella tabella si apre la colonna «Descrizione», si sceglie `format: currency` e `aggregate: sum`; l'anteprima mostra subito la riga dei totali.

## 3. Anteprima

Nessuna chiamata esce dal browser. Le porte dell'anteprima (`preview/preview-ports.ts`):

- **DataClient**: riconosce il data source dalla richiesta (metodo e URL, con le parti `{{ }}` libere) e risponde con i suoi dati di esempio; senza dati, `[]` per le letture e `{}` per le scritture. Ogni richiesta finisce nel registro.
- **Authorization / UserProvider**: tutti i permessi (interruttore «Tutti i permessi» per vedere la schermata come un utente senza permessi); utente `anteprima` nella lingua dell'editor.
- **ScreenNavigator**: non cambia pagina; scrive la navigazione nel registro e mostra un messaggio.
- **RuntimeDiagnostics**: le segnalazioni tecniche finiscono nel registro.

Si possono provare le larghezze (desktop, tablet 768 px, telefono 375 px) e i parametri della schermata (`params`, per esempio `{"id": 1}`). Il ridisegno parte 250 ms dopo l'ultima modifica.

Per collegare disegno e struttura, `lc-node` espone `data-node-id` e `data-node-type` (mai dati): per questo l'editor dà un `id` a ogni nodo che crea. I nodi senza `id` (scritti a mano) si selezionano solo dalla struttura.

## 4. Scorciatoie

| Tasti | Azione |
| --- | --- |
| Ctrl+Z / Ctrl+Y (o Ctrl+Maiusc+Z) | annulla / ripeti (anche dentro i campi: le modifiche ravvicinate alla stessa proprietà sono un solo passo) |
| Canc | elimina il nodo selezionato |
| Ctrl+D | duplica |
| Ctrl+C / Ctrl+X / Ctrl+V | copia / taglia / incolla nel punto di inserimento |
| Alt+↑ / Alt+↓ | sposta su / giù |
| Alt+clic nell'anteprima | seleziona il componente |
| Ctrl+Invio in un campo JSON | applica |

Fuori da annulla e ripeti, le scorciatoie valgono quando il fuoco non è in un campo di testo.

## 5. Struttura del codice

```
editor/src/app/
  model/      doc-ops (operazioni pure sul documento), schema-info (lettura dello schema),
              templates (modelli, valori iniziali, riassunti), drop (trascinamento),
              texts (testi e chiavi di traduzione), editor-store (stato)
  ui/         palette, outline, inspector, fields (campi ricorsivi), json-field, json-view,
              data-sources, texts, issues
  preview/    preview (anteprima), preview-ports (porte finte)
  app.*       guscio, barra degli strumenti, scorciatoie
  messages.ts scritte dell'editor (chiavi ed.*, it ed en)
```

- Il documento è **immutabile**: ogni operazione restituisce una copia che condivide le parti non toccate, così la cronologia (200 passi) costa poco.
- `EditorStore` contiene documento, selezione (un percorso come `['components', 0, 'tabs', 1]`), cronologia, problemi calcolati (`computed`) e dati di esempio.
- I test: operazioni sul documento, lettura dello schema (ogni tipo ha un modello valido), stato dell'editor, trascinamento, porte dell'anteprima e un test d'insieme che usa l'interfaccia vera (tavolozza → struttura → proprietà → anteprima, errori, data source, JSON, elenchi, selezione dall'anteprima).

## 6. Limiti e prossimi passi

- **Solo schermate.** Navigazione (casi d'uso e menu) e temi si modificano ancora a mano; sono i prossimi documenti da portare nell'editor, con la stessa tecnica (pannello generato dallo schema).
- **Traduzioni.** Le traduzioni si esportano in un file da unire a mano ai cataloghi; quando i cataloghi verranno da un servizio, l'editor li aggiornerà direttamente. Le lingue sono quelle della demo (italiano e inglese).
- **Pubblicazione.** Si esporta un file; il collegamento al registro (bozza, revisione, pubblicazione con versioni) è da fare, con la validazione lato servizio.
- **Espressioni.** Sintassi controllata, ma nessun completamento delle variabili (`state`, `row`, `form`…) né dei nomi dei campi delle righe.
- **Anteprima e procedure.** Selezionare un nodo in un passo successivo di un wizard non porta a quel passo (i passi si superano solo con le loro condizioni).
- **Larghezza.** Sotto i 1100 px i pannelli si impilano; l'editor è pensato per schermi da desktop.
