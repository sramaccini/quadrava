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

## Avvio rapido

Prerequisiti: Node.js 22.22.3+, JDK 21, Maven 3.9+, Docker.

1. Identity provider: `cd idp && docker compose up` (console su http://localhost:8180, utente `admin`, password `admin`).
2. Reference implementation: `cd reference && mvn verify`, poi per ogni modulo `mvn -pl <modulo> spring-boot:run`.
   Porte: bff 8080, registry 8081, authz 8082, telemetry 8083.
3. Frontend: `cd frontend && npm install`, poi `npm run start:runtime` (porta 4200) oppure `npm run start:editor` (porta 4201).
4. Validazione degli esempi contro lo schema: `cd frontend && npm run validate:examples`.

Utenti di sviluppo in Keycloak: `operatore`, `responsabile`, `amministratore` (password uguale al nome utente). Sono solo per sviluppo locale.

## Stato

Scheletro iniziale. Verificato: build di tutte le app e librerie Angular, test dell'app `runtime`, validità dei tre contratti OpenAPI, validità degli esempi contro lo schema del nucleo.
Non ancora verificato: la compilazione e i test dei moduli Java (vanno lanciati con `mvn verify`; i nomi degli starter di Spring Boot 4 vanno controllati al primo build).

## Prossimi passi

- Schema del nucleo: estendere `screen.schema.json` con i componenti del catalogo.
- Interprete, stato e motore di azioni in `core`; client HTTP, autenticazione, autorizzazione e telemetria in `services`.
- Prova di fattibilità del linguaggio di espressioni (CEL) in `expressions`.
- BFF: protezione CSRF, inoltro delle API con token e `traceparent`, elenco degli host consentiti.
