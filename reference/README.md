# Reference implementation

Implementa i contratti di `../contracts` per dimostrarli e per fare da banco di prova. **Non è per la produzione**: archivi in memoria, utenti di sviluppo, nessuna alta disponibilità.

| Modulo | Porta | Contratto |
| --- | --- | --- |
| `bff` | 8080 | Sessione OIDC con Keycloak, token solo lato server |
| `registry` | 8081 | `registry.yaml` |
| `authz` | 8082 | `authz.yaml` |
| `telemetry` | 8083 | `telemetry.yaml` |

Il BFF inoltra le rotte di `lowcode.bff.routes` con il token dell'utente (rinnovato quando scade) e `traceparent`, senza cookie né `Authorization` del browser: `/registry` → registro, `/authz` → autorizzazioni, `/telemetry` → telemetria, `/api` → backend dell'applicazione (in sviluppo `npm run demo-api` di `frontend/`, porta 8084). Protegge le scritture con CSRF (cookie `XSRF-TOKEN`, intestazione `X-XSRF-TOKEN`), risponde 401 alle API senza sessione e 502 se il servizio non risponde. Dopo il login (`/bff/login?return=...`) riporta l'utente solo alle origini di `lowcode.bff.frontend-origins`; la radice rimanda a `lowcode.bff.home` (`LOWCODE_HOME`, di norma il runtime). L'uscita (`POST /logout`) chiude anche la sessione di Keycloak (logout OIDC con `id_token_hint`); alle chiamate con `Accept: application/json` risponde `{"redirect": "<indirizzo>"}` invece di reindirizzare.

Il registro (contratto 0.3) valida ogni documento contro gli stessi JSON Schema del frontend (`frontend/projects/schema/src/lib/schemas`, copiati nel jar dalla build; un test controlla che dia lo stesso giudizio di Ajv su tutti gli esempi) e rifiuta i documenti non validi con l'elenco dei problemi. Le versioni hanno uno stato di revisione (bozza → in-revisione → approvata o respinta): approva o respinge solo chi ha un ruolo di `lowcode.registry.approver-roles` (`responsabile`, `amministratore`) e mai l'autore; negli ambienti di `lowcode.registry.protected-environments` (`collaudo`, `produzione`) si pubblicano solo versioni approvate. Il salvataggio con `If-Match` riesce solo se nessuno ha salvato nel frattempo (412 altrimenti). Con `lowcode.registry.storage-dir` (variabile `LOWCODE_REGISTRY_DIR`) l'archivio è su file: una cartella per documento, scritture atomiche, identificativi controllati prima di diventare percorsi. Oltre a schermate, navigazione e temi conserva i cataloghi delle traduzioni (`messages`, uno per lingua). Il registro registra come autore delle versioni il nome utente (`preferred_username`), non l'identificativo interno di Keycloak. Il realm di sviluppo (`idp/realm-lowcode.json`) ha anche il client pubblico `lowcode-strumenti` (solo password grant) per gli script locali come `publish-examples`: non va riprodotto in un realm vero.

Il registro ha un profilo `senza-auth` per provare editor e runtime in locale senza Keycloak (vedi il README principale): nessuna autenticazione, un avviso nel log all'avvio, mai fuori dalla macchina di chi sviluppa.

Comandi: `mvn verify` per compilare e testare tutto (verificato con JDK 21 e Maven 3.9.6); `mvn -pl authz spring-boot:run` (o `java -jar <modulo>/target/*.jar`) per avviare un modulo (serve Keycloak in esecuzione: `cd idp && docker compose up`). Provato dal vivo il 13 ottobre 2026 con Keycloak 26.8: login, permessi, dati, scrittura con CSRF, uscita.

Un backend del cliente deve superare gli stessi test di conformità ai contratti di questa implementazione. Per il registro c'è il kit `npm run conformance:registry` (in `frontend/`: verifica via HTTP salvataggio, validazione, If-Match, storico, pubblicazione con ETag, ambienti protetti e revisione; il registro di riferimento supera 17 prove su 17); per autorizzazioni e telemetria il kit è da realizzare. Tutto lo stack si avvia con `npm run stack` (vedi il README principale).
