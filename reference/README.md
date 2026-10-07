# Reference implementation

Implementa i contratti di `../contracts` per dimostrarli e per fare da banco di prova. **Non è per la produzione**: archivi in memoria, utenti di sviluppo, nessuna alta disponibilità.

| Modulo | Porta | Contratto |
| --- | --- | --- |
| `bff` | 8080 | Sessione OIDC con Keycloak, token solo lato server |
| `registry` | 8081 | `registry.yaml` |
| `authz` | 8082 | `authz.yaml` |
| `telemetry` | 8083 | `telemetry.yaml` |

Comandi: `mvn verify` per compilare e testare tutto; `mvn -pl authz spring-boot:run` per avviare un modulo (serve Keycloak in esecuzione).

Un backend del cliente deve superare gli stessi test di conformità ai contratti di questa implementazione (kit di test da realizzare).
