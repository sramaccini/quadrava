# Reference implementation

Implementa i contratti di `../contracts` per dimostrarli e per fare da banco di prova. **Non è per la produzione**: archivi in memoria, utenti di sviluppo, nessuna alta disponibilità.

| Modulo | Porta | Contratto |
| --- | --- | --- |
| `bff` | 8080 | Sessione OIDC con Keycloak, token solo lato server |
| `registry` | 8081 | `registry.yaml` |
| `authz` | 8082 | `authz.yaml` |
| `telemetry` | 8083 | `telemetry.yaml` |

Il BFF inoltra le rotte di `lowcode.bff.routes` (oggi `/registry` → registro) con il token dell'utente e `traceparent`, protegge le scritture con CSRF (cookie `XSRF-TOKEN`, intestazione `X-XSRF-TOKEN`), risponde 401 alle API senza sessione e dopo il login (`/bff/login?return=...`) riporta l'utente solo alle origini di `lowcode.bff.frontend-origins`.

Il registro ha un profilo `senza-auth` per provare editor e runtime in locale senza Keycloak (vedi il README principale): nessuna autenticazione, un avviso nel log all'avvio, mai fuori dalla macchina di chi sviluppa.

Comandi: `mvn verify` per compilare e testare tutto (verificato con JDK 21 e Maven 3.9.6); `mvn -pl authz spring-boot:run` per avviare un modulo (serve Keycloak in esecuzione).

Un backend del cliente deve superare gli stessi test di conformità ai contratti di questa implementazione (kit di test da realizzare).
