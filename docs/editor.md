# Editor visuale

L'editor (`frontend/projects/editor`) modifica le **schermate**, la **navigazione** (casi d'uso e menu) e il **tema**; un selettore nella barra degli strumenti passa dall'uno all'altro. Per le schermate produce lo stesso JSON che il runtime legge: chi lo usa compone la schermata con tavolozza, struttura e pannello delle proprietà, e vede subito il risultato disegnato dal runtime vero. Non esiste un formato intermedio: quello che si esporta si mette in `examples/` (o, in futuro, si pubblica nel registro) così com'è.

Avvio: `cd frontend && npm run start:editor` (porta 4201; costruisce le librerie e copia gli esempi).

## 1. Com'è fatto

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Editor  File  Modifica  ↶ ↷          Valida [Schermata|Navigazione|Tema]  IT │
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

In alto c'è una **barra dei menu** come nelle applicazioni desktop:

- **File**: Nuova, Apri esempio ▸ (sottomenu con gli esempi della modalità corrente), Importa…, Esporta, Registro…;
- **Modifica**: Annulla, Ripeti; per le schermate Taglia, Copia, Incolla; Duplica, Elimina, Sposta su, Sposta giù (anche nella navigazione). Ogni voce mostra la sua scorciatoia; quelle che non si possono usare (niente da annullare, nessun nodo selezionato, appunti vuoti) sono spente.

Un clic apre e chiude un menu e, a menu aperto, passando sull'altro titolo si cambia menu; un clic fuori lo chiude. Da tastiera (schema «menubar» di WAI-ARIA): Tab raggiunge la barra, frecce sinistra e destra tra i menu, giù (o Invio, Spazio) apre e scorre le voci saltando quelle spente, Home e Fine, destra entra nel sottomenu e sinistra ne esce, Esc chiude e riporta il fuoco al titolo. Dopo un comando il fuoco torna dov'era. Accanto ai menu restano le icone di annulla e ripeti; a destra lo stato del documento, il selettore **Schermata / Navigazione / Tema** e la lingua, che restano insieme anche quando la barra va a capo.

Componenti, struttura e proprietà stanno in **riquadri separati**, ognuno con il titolo su una barra grigio scuro a testo bianco (colori dell'editor, non del tema in modifica) e il proprio scorrimento; lo stesso vale per struttura, profilo simulato e proprietà della navigazione e per le proprietà del tema. Sotto i 1100 px componenti e struttura si affiancano sopra l'anteprima e le proprietà vanno sotto.

- **Tavolozza.** Gruppi: «Struttura e testi» (sezione, box, griglia, border layout, schede, procedura, testo, testo formattato — un `text` con `format: markdown` e un esempio di elenco —, messaggio, immagine, collegamento; anche il messaggio accetta `format: markdown`), «Campi» (un campo a sé per tipo: casella di testo, elenco a discesa, data, editor di testo formattato…, con nomi che non si ripetono nella schermata), «Inserimento e azioni», «Dati», «Visualizzazione» (indicatori, grafico, avanzamento, timeline, kanban, albero, calendario). Un clic aggiunge il componente nel punto di inserimento: dentro il contenitore selezionato (schermata, sezione, box, griglia, border, scheda, passo), altrimenti subito dopo il nodo selezionato. In alternativa lo si trascina nella struttura **o direttamente sull'anteprima**: lì il componente sotto il puntatore decide il punto (bordo alto prima, bordo basso dopo, centro dentro se è un contenitore; fuori dai componenti in fondo alla schermata) e un indicatore lo mostra. Ogni componente nasce da un modello valido; se usa un data source (`source`) e questo manca, l'editor lo crea (GET `/api/<nome>`, POST con `{{ request }}` per la datatable lato server).
- **Struttura.** L'albero dei nodi, con schede e passi. Il nodo selezionato mostra i comandi sposta su/giù, duplica (identificativi nuovi), taglia, elimina; tabs e wizard anche «aggiungi scheda/passo». I nodi si trascinano prima, dopo o dentro un'altra riga. Un pallino rosso o giallo segnala errori o avvisi del nodo.
- **Proprietà.** I campi dell'elemento selezionato, generati dallo schema JSON (§ 2). Le condizioni (`visibleIf`, `hiddenIf`, `enabledIf`, `readOnlyIf`, `nextIf`) e il tooltip stanno in un gruppo a parte, aperto solo se ne è impostata una. Dentro `{{ }}`, dopo l'inizio di un nome, compare il **completamento**: variabili del contesto (riga, form, stato e parametri usati nel documento, utente) e funzioni; frecce per scegliere, Invio o Tab per inserire (nelle funzioni il cursore va tra le parentesi o gli apici), Esc per chiudere.
- **Anteprima.** La schermata disegnata da `lc-screen`, con il tema in modifica, in un iframe isolato (§ 3). Il nodo selezionato è evidenziato da un riquadro tratteggiato (se sta in una scheda nascosta, l'anteprima apre quella scheda); Alt+clic su un componente, o un clic in modalità «Seleziona», lo seleziona invece di attivarlo. In modalità «Seleziona» i componenti si **trascinano per spostarli** (prima, dopo o dentro un altro, con l'indicatore) e quello selezionato dentro una griglia o un box ha una **maniglia** sul bordo destro: trascinandola cambiano le colonne occupate (`span`, a colonne intere) o la quota di spazio (`grow`). Con **«Dati veri»** le letture vanno ai servizi dell'applicazione (editor dietro il BFF: `npm run stack` o `start:editor:bff`) invece dei dati di esempio; le scritture restano bloccate e il registro dell'anteprima lo dice.
- **JSON.** Il documento intero, modificabile a mano; «Applica» lo sostituisce in un solo passo annullabile, il testo non valido non tocca nulla.
- **Data source.** Metodo, URL, parametri, corpo e paginazione di ogni data source; rinominarlo aggiorna i nodi (`source`) e i passi (`call`, `refresh`) che lo usano. Accanto, i **dati di esempio** che l'anteprima restituisce al posto del servizio.
- **Testi.** Tutti i testi che l'utente legge (titoli, etichette, messaggi, tooltip, conferme…), con dove stanno. Un testo semplice non cambia con la lingua: «Rendi traducibile» lo sostituisce con `{{ t('schermata.chiave', 'Testo') }}` (chiave dal prefisso della schermata e dalle prime parole, unica) e lo usa come traduzione italiana (gli a capo di un testo formattato diventano `\n` nell'espressione). Per ogni chiave si scrivono le traduzioni italiana e inglese, che valgono subito nell'anteprima; le traduzioni mancanti sono segnalate e contate nel titolo della scheda. «Esporta traduzioni» scarica `<schermata>.i18n.json` (`{ "it": {…}, "en": {…} }`) da unire ai cataloghi `examples/i18n/<lingua>.json`; «Salva nel registro e pubblica in <ambiente>» unisce le traduzioni modificate all'ultima versione del catalogo della lingua (documento `messages`, con If-Match) e la pubblica nell'ambiente scelto nel pannello del registro. I testi con graffe (parametri dei messaggi) e le espressioni più complesse si rendono traducibili a mano.
- **Problemi.** Errori di schema, espressioni CEL non valide, identificativi ripetuti (errori) e data source non definiti (avvisi). Un clic porta all'elemento. Con errori l'anteprima resta all'ultima versione valida.

- **Registro.** «File → Registro…» apre un pannello per il documento aperto (schermata, navigazione o tema), che nel registro è un documento a sé (`contracts/registry.yaml` 0.3): si indicano applicazione e ambiente (ricordati nel browser; «sviluppo» all'inizio); «Salva versione» manda il documento (bloccato se ha errori o se l'identificativo non è valido) indicando la versione da cui si è partiti: se nel frattempo un altro ha salvato, il pannello lo dice e chiede se salvare comunque; se il registro rifiuta il documento, gli errori di schema si elencano punto per punto. «Storico» elenca le versioni, dalla più recente, con lo **stato di revisione** (bozza, in revisione, approvata, respinta, con chi ha deciso e la nota) e gli ambienti in cui ognuna è pubblicata; ogni versione si riapre, si **confronta** con il documento aperto (differenze per percorso), si manda in revisione, si approva o respinge (solo i revisori, mai l'autore: lo decide il registro) o si pubblica nell'ambiente indicato (con conferma; collaudo e produzione accettano solo versioni approvate). Gli errori del servizio si mostrano come messaggi brevi (registro non raggiungibile, permessi, non trovato, rifiutato con il titolo del Problem), mai con i dettagli tecnici. Le chiamate vanno a `/registry` sulla stessa origine e le inoltra il BFF, con il token dell'utente: le scritture rimandano il token CSRF del cookie `XSRF-TOKEN` (se il cookie non c'era ancora, la prima scrittura riceve 403 e si ripete una volta). Senza sessione il pannello mostra «Accedi», che passa dal login del BFF e torna all'editor. In sviluppo senza Keycloak: `npm run start:editor:registro` parla direttamente con il registro di riferimento avviato con il profilo `senza-auth`.

La bozza (documento, dati di esempio e traduzioni scritte nell'editor) si salva da sola nel browser a ogni modifica e si riprende alla riapertura. «File → Apri esempio» offre le schermate di `examples/` (l'elenco `examples/index.json` lo scrive `tools/copy-examples.mjs`); «Importa…» ed «Esporta» leggono e scrivono un file `.json`.

## 2. Pannello delle proprietà generato dallo schema

L'editor non ha un elenco proprio delle proprietà dei componenti: le legge da `screen.schema.json` (`model/schema-info.ts`). Così un componente o una proprietà nuova compare da sola nell'editor; basta aggiungere il modello iniziale in `model/templates.ts` e il nome nella tavolozza (un contenitore di nodi anche in `LAYOUT_CONTAINERS` di `model/schema-info.ts`). La posizione di un nodo dentro un contenitore di layout (`grow`, `span`, `region`) si imposta nel pannello delle proprietà del nodo stesso (un test fallisce se un tipo dello schema non ha modello valido o non è nella tavolozza).

| Nello schema | Nel pannello |
| --- | --- |
| `enum` | scelta (vuota = proprietà assente, se facoltativa) |
| `$ref: expression` | area di testo con `{{ … }}` e l'aiuto «Variabili e funzioni»: le variabili del punto in cui si scrive (`row.<campo>` nelle colonne e nelle azioni di riga, `form.<campo>` nei form e nelle finestre, `value` nelle regole di validazione, `search`/`lookupKey`/`request` nei data source), lo stato e i parametri già usati nel documento, l'utente, e le funzioni (`can`, `t`, `has`, `fmt*`, `plural`); un clic le inserisce al cursore |
| `string` | testo; area di testo per testi lunghi e per ogni valore con `{{ }}`; `source`, `call`, `refresh` suggeriscono i data source, `navigate` le schermate note |
| `boolean` | casella (deselezionata = proprietà assente) |
| `integer` / `number` | numero con minimo e massimo dello schema |
| oggetto chiuso (`sort`, `selection`, `lookup`, `dialog`…) | gruppo di campi, «Imposta» / «Togli» se facoltativo |
| elenco di oggetti (`columns`, `fields`, `rowActions`, `items`, `series`…) | elementi apribili uno per uno, con sposta, elimina, aggiungi (un elemento nuovo ha già le proprietà obbligatorie, compreso un passo se l'elenco dei passi è obbligatorio); vista JSON dell'elenco |
| elenco di passi (`onClick`, `onSubmit`, `onSelect`) | come sopra, e «Aggiungi» chiede la variante: `call`, `refresh`, `navigate`, `toast`, `set`, `confirm`, `dialog` |
| elenco di nodi (`components`) | non nel pannello: si gestisce nella struttura |
| mappe libere (`params`, `initial`, `badges`, `args`) e il resto | JSON |

Le colonne ereditano i campi da più definizioni (`columnProps` → `tableColumnProps` → `dataColumn`): l'editor segue `$ref` e unisce le proprietà, quindi una colonna di datatable mostra anche `filter` e `groupable`.

Un testo vuoto toglie la proprietà facoltativa; quella obbligatoria resta vuota e la validazione la segnala. Esempio: nella tabella si apre la colonna «Descrizione», si sceglie `format: currency` e `aggregate: sum`; l'anteprima mostra subito la riga dei totali.

## 3. Anteprima

Le anteprime (schermata, menu, tema) girano in un **iframe isolato** (ADR-08): la stessa applicazione dell'editor, avviata con `?anteprima`, con la propria radice (`PreviewApp`) e il runtime vero. Essendo una pagina a sé, tema, stili e foglio scuro di NG-ZORRO valgono solo lì, come in produzione. Editor e anteprima si parlano con messaggi di formato definito (`preview/protocol.ts`), solo tra finestre della stessa origine e solo con il proprio iframe:

| Da → a | Messaggio | Contenuto |
| --- | --- | --- |
| anteprima → editor | `lc-preview:ready` | l'iframe è pronto: l'editor gli manda lo stato (anche dopo un ricaricamento) |
| editor → anteprima | `lc-preview:state` | schermata, menu, tema (validi), profilo simulato, dati di esempio, parametri, lingua, traduzioni della bozza, nodo selezionato, modalità selezione, versione (Ricarica) |
| anteprima → editor | `lc-preview:select` | id del componente scelto con Alt+clic o in modalità selezione |
| anteprima → editor | `lc-preview:event` | riga del registro: richiesta, navigazione, segnalazione |

Ogni messaggio arriva clonato: l'anteprima confronta schermata, parametri, menu e tema per contenuto, così un messaggio che cambia solo la selezione non ridisegna la schermata (le schede restano dove sono, i form non si svuotano). L'iframe resta vivo nelle altre viste (JSON, data source, testi) e non si ricarica a ogni cambio.

Nessuna chiamata esce dal browser. Le porte dell'anteprima (`preview/preview-ports.ts`, dentro l'iframe):

- **DataClient**: riconosce il data source dalla richiesta (metodo e URL, con le parti `{{ }}` libere) e risponde con i suoi dati di esempio; senza dati, `[]` per le letture e `{}` per le scritture. Ogni richiesta finisce nel registro.
- **Authorization / UserProvider**: i permessi del profilo simulato che manda l'editor (tutti, oppure nessuno con l'interruttore «Tutti i permessi» spento; nella navigazione quelli scelti uno per uno); utente `anteprima` nella lingua dell'editor.
- **ScreenNavigator**: non cambia pagina; manda la navigazione al registro dell'editor e mostra un messaggio.
- **RuntimeDiagnostics**: le segnalazioni tecniche finiscono nel registro dell'editor.

Si possono provare le larghezze (desktop, tablet 768 px, telefono 375 px) e i parametri della schermata (`params`, per esempio `{"id": 1}`). Il ridisegno parte 250 ms dopo l'ultima modifica.

Per collegare disegno e struttura, `lc-node` espone `data-node-id` e `data-node-type` (mai dati): per questo l'editor dà un `id` a ogni nodo che crea. I nodi senza `id` (scritti a mano) si selezionano solo dalla struttura.

## 3b. Navigazione

Modalità «Navigazione»: il documento `navigation.json` (casi d'uso, gruppi, sottogruppi, voci).

- **Struttura** a sinistra, con «+ Caso d'uso», «+ Gruppo», «+ Voce»: un elemento nuovo va dentro il caso d'uso o il gruppo selezionato, o accanto alla voce selezionata; i gruppi si fermano al secondo livello, come impone lo schema. Sposta, duplica (id nuovi), elimina come per le schermate.
- **Proprietà** a destra, generate da `navigation.schema.json` con lo stesso pannello delle schermate: `screen` suggerisce le schermate note, `icon` le icone del set integrato, `requires` i permessi già usati, `default` i casi d'uso.
- **Anteprima del menu** al centro: il menu vero (`lc-sidebar` con `NavigationRuntime`) e un **profilo simulato**. Con «Tutti i permessi» spento si sceglie quali permessi ha l'utente (quelli citati dai `requires` del menu) e si vede che cosa gli compare. Un clic su una voce non naviga: mostra quale schermata aprirebbe.
- **Problemi**: schema, espressioni, id ripetuti tra fratelli (errori), schermate non note e caso d'uso predefinito inesistente (avvisi).

La bozza della navigazione si salva nel browser come quella della schermata; «Apri esempio» apre la navigazione della demo, «Esporta» scarica `<navigation>.json`.

## 3c. Tema

Modalità «Tema»: un file di `examples/themes/` (design token). Il pannello a destra mostra tutti i token, gruppo per gruppo (colori, tipografia, forma, densità, layout di barra laterale, intestazione, pagina), generati da `theme.schema.json`; i colori hanno un selettore accanto al testo (`#rrggbb`; `rgb()` e `hsl()` si scrivono nel testo). L'anteprima disegna **la schermata e il menu aperti nelle altre modalità** con il tema, nel suo iframe: i temi scuri sono completi (anche le superfici di NG-ZORRO) e l'editor resta com'è. Anche le anteprime della schermata e del menu usano il tema in modifica (quello chiaro della demo, se il tema ha errori fin dall'inizio). Con errori l'anteprima resta all'ultimo tema valido. «Apri esempio» elenca i temi della demo (`examples/themes/index.json`, scritto da `tools/copy-examples.mjs`).

## 4. Scorciatoie

| Tasti | Azione |
| --- | --- |
| Tab sulla barra dei menu, poi frecce | apre i menu File e Modifica (vedi sopra) |
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
  model/      doc-ops (operazioni pure sul documento), schema-info (SchemaReader: lettura di uno schema),
              document-state (documento, selezione, cronologia, problemi: comune ai documenti),
              editor-store (la schermata), navigation-store (la navigazione), theme-store (il tema),
              templates (modelli, valori iniziali, riassunti), drop (trascinamento), texts (testi e chiavi), registry-client (client del registro)
  ui/         menu-bar (barra dei menu), palette, outline, inspector, fields (campi ricorsivi), json-field, json-view,
              data-sources, texts, issues, navigation-editor, theme-editor, registry-panel
  preview/    protocol (messaggi), preview-frame (l'iframe, lato editor), preview (barra dell'anteprima della
              schermata), preview-log (registro); dentro l'iframe: preview-app, preview-config, preview-ports
  app.*       guscio, barra degli strumenti, scorciatoie
  messages.ts scritte dell'editor (chiavi ed.*, it ed en)
```

- Il documento è **immutabile**: ogni operazione restituisce una copia che condivide le parti non toccate, così la cronologia (200 passi) costa poco.
- `DocumentState` contiene documento, selezione (un percorso come `['components', 0, 'tabs', 1]`), cronologia e problemi calcolati (`computed`); `EditorStore` (schermata, con dati di esempio e traduzioni) e `NavigationStore` lo estendono. `ed-fields` e la vista JSON lavorano su `DocumentState`: l'editor della navigazione li ridirige sul proprio documento con un provider.
- I test: operazioni sul documento, lettura dello schema (ogni tipo ha un modello valido), stato dell'editor, trascinamento, porte dell'anteprima; l'anteprima dentro l'iframe guidata con i suoi messaggi (disegno, dati di esempio, selezione, schede, menu e profilo, tema scuro, messaggi estranei ignorati); un test d'insieme che usa l'interfaccia vera e controlla gli stati mandati all'iframe (in jsdom l'iframe non carica l'applicazione: il test ne simula il «pronto»).

## 6. Limiti e prossimi passi

- **Traduzioni.** Le lingue sono quelle della demo (italiano e inglese); la revisione dei cataloghi (documenti `messages`) si fa con le API del registro, il pannello «Testi» salva e pubblica direttamente.
- **Espressioni.** Completamento e controllo della sintassi, ma nessun controllo che i campi usati (`row.x`) esistano davvero nelle risposte dei servizi.
- **Anteprima.** In modalità «Seleziona» i componenti si trascinano per spostarli e quello selezionato in una griglia o in un box ha una maniglia per `span` o `grow`; i lati del border si ridimensionano solo nel runtime (nell'editor con `westWidth` ed `eastWidth`).
- **Confronto.** Tra una versione del registro e il documento aperto; per confrontare due versioni se ne apre una e si confronta l'altra.
- **Anteprima e procedure.** Selezionare un nodo in un passo successivo di un wizard non porta a quel passo (i passi si superano solo con le loro condizioni).
- **Larghezza.** Sotto i 1100 px i pannelli si impilano; l'editor è pensato per schermi da desktop.

**Decisioni (13 ottobre 2026).** ADR-08 accettata: anteprima in iframe isolato (realizzata). ADR-09 modificata: la cronologia conserva versioni immutabili del documento invece di operazioni JSON Patch; le patch si ricavano per differenza quando serviranno diff tra versioni e lock. Registro: un documento per schermata, uno per la navigazione, uno per tema.
