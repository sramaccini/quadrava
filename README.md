# Piattaforma LowCode

Piattaforma per costruire applicazioni gestionali e amministrative descrivendo l'interfaccia in JSON, con un editor visuale che produce quel JSON.
Lato backend la piattaforma consegna solo interfacce REST (OpenAPI) e una reference implementation, non pensata per la produzione.

Documentazione di riferimento: vedi [docs/README.md](docs/README.md).

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `frontend/` | Workspace Angular: app `runtime` ed `editor`, librerie `schema`, `core`, `expressions`, `services`, `components` |
| `contracts/` | Contratti OpenAPI 3.1: `authz.yaml`, `telemetry.yaml`, `registry.yaml` |
| `reference/` | Reference implementation (Spring Boot, Maven multi-modulo): `bff`, `registry`, `authz`, `telemetry` |
| `idp/` | Keycloak per lo sviluppo locale (docker compose e realm di esempio) |
| `examples/` | Applicazioni JSON di riferimento, usate nella validazione e nei test |
| `docs/` | Documentazione e decisioni architetturali |

## Versioni

| Componente | Versione | Nota |
| --- | --- | --- |
| Angular | 22.2.1 | Richiede Node.js 22.22.3 o superiore (oppure 24.15 o superiore) |
| TypeScript | 6.0.x | Non usare la 7: Angular 22.2 dichiara compatibilità con `>=6.0 <6.1` |
| Spring Boot | 4.1.1 | Java 21 |
| Keycloak | 26.8.0 | Immagine `quay.io/keycloak/keycloak` |

## Demo del frontend (senza backend)

Serve solo Node.js (22.22.3+ oppure 24.15+). La demo usa un backend finto in memoria, permessi simulati e le schermate JSON di `examples/`.

```
cd frontend
npm ci
npm run start:runtime
```

Poi apri http://localhost:4200. Il comando compila le librerie nell'ordine giusto (`schema`, `expressions`, `core`, `components`), copia gli esempi e avvia l'app.
Nella barra in alto si cambiano **utente** (operatore, responsabile, amministratore) e **tema** (chiaro, scuro). A sinistra c'è il **menu**, definito in `examples/navigation.json`: un selettore in cima sceglie il **caso d'uso**, sotto ci sono le voci fino a tre livelli. I quattro casi d'uso della demo (Inserimento Fattura, Consultazione Fatture, Creazione pacchetto, Revisione Spese) sono solo esempi: la piattaforma non ha casi d'uso predefiniti. Cosa provare:

- Con `operatore` il selettore mostra due casi d'uso; con `responsabile` quattro. I permessi del profilo decidono cosa compare, e i gruppi senza voci visibili spariscono.
- Ogni schermata ha un URL (`/consultazione-fatture/fatture-elenco`, `/inserimento-fattura/fattura-nuova?tipo=passiva`): Indietro, preferiti e link condivisi funzionano. Aprire a mano l'URL di una schermata senza permesso mostra il rifiuto.
- Inserimento Fattura: il form valida i campi, salva in bozza e porta all'elenco delle bozze.
- Revisione Spese: due voci puntano alla stessa schermata con parametri diversi (da revisionare, revisionate); Approva e Respingi compaiono solo con il permesso di revisione.
- Il pulsante in alto nella barra laterale la comprime a sole icone.
- Il dettaglio ordine mostra il campo IBAN solo ad `amministratore`.
- Le librerie non si ricaricano a caldo: dopo una modifica in `projects/<libreria>` rilancia `npm run build:libs`.

Test: `npm run test:libs` (librerie) e `npx ng test runtime --watch=false` (demo end-to-end con le schermate reali).

## Avvio completo

Prerequisiti: Node.js 22.22.3+, JDK 21, Maven 3.9+, Docker.

1. Identity provider: `cd idp && docker compose up` (console su http://localhost:8180, utente `admin`, password `admin`).
2. Reference implementation: `cd reference && mvn verify`, poi per ogni modulo `mvn -pl <modulo> spring-boot:run`.
   Porte: bff 8080, registry 8081, authz 8082, telemetry 8083.
3. Frontend: `cd frontend && npm ci`, poi `npm run start:runtime` (porta 4200) oppure `npm run start:editor` (porta 4201, ancora scheletro).
4. Validazione degli esempi contro gli schemi: `cd frontend && npm run validate:examples`.

Utenti di sviluppo in Keycloak: `operatore`, `responsabile`, `amministratore` (password uguale al nome utente). Sono solo per sviluppo locale.

## Stato

Verificato: schema di schermate, temi e navigazione, valutatore di espressioni CEL, interprete (`core`), catalogo componenti (`components`) e demo `runtime`, con 95 test automatici; build di tutte le app e librerie; validità dei tre contratti OpenAPI e degli esempi.
Non ancora verificato: la compilazione e i test dei moduli Java (vanno lanciati con `mvn verify`; i nomi degli starter di Spring Boot 4 vanno controllati al primo build). La demo non è stata provata in un browser reale: è coperta da test con jsdom.
Punto aperto di sicurezza: Ajv genera codice con `new Function`, quindi la validazione nel browser richiede `unsafe-eval` nella Content-Security-Policy. Prima della produzione va precompilata (Ajv standalone) oppure spostata alla pubblicazione nel registry.

## Prossimi passi

- `services`: client HTTP, autenticazione, autorizzazione (con `X-Permissions-Version`) e telemetria, al posto delle porte finte della demo.
- Editor visuale (`editor`): albero dei nodi, pannello proprietà, anteprima, temi e menu.
- Menu: navigazione da tastiera con le frecce, badge sulle voci, ricerca nel menu.
- Controllo delle espressioni anche in `validate:examples`.
- BFF: protezione CSRF, inoltro delle API con token e `traceparent`, elenco degli host consentiti.
