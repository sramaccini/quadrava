package it.lowcode.reference.telemetry;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ingestione OTLP/HTTP (JSON) di tracce e log, secondo contracts/telemetry.yaml. Il corpo deve essere un oggetto JSON
 * con l'elenco del suo segnale (`resourceSpans` per le tracce, `resourceLogs` per i log); gli errori sono Problem.
 */
@RestController
public class TelemetryController {

    private static final Logger log = LoggerFactory.getLogger(TelemetryController.class);

    private final Redactor redactor;
    private final int maxBytes;

    public TelemetryController(Redactor redactor, @Value("${lowcode.telemetry.max-bytes:1000000}") int maxBytes) {
        this.redactor = redactor;
        this.maxBytes = maxBytes;
    }

    @PostMapping(path = "/telemetry/v1/traces", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> traces(@RequestBody String payload) {
        return accept("traces", "resourceSpans", payload);
    }

    @PostMapping(path = "/telemetry/v1/logs", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> logs(@RequestBody String payload) {
        return accept("logs", "resourceLogs", payload);
    }

    private ResponseEntity<?> accept(String signal, String listProperty, String payload) {
        if (payload.getBytes(StandardCharsets.UTF_8).length > maxBytes) {
            return problem(HttpStatus.CONTENT_TOO_LARGE, "Corpo oltre il limite di " + maxBytes + " byte");
        }
        Map<String, Object> document;
        try {
            document = JsonParserFactory.getJsonParser().parseMap(payload);
        } catch (IllegalArgumentException e) {
            // Comprende JsonParseException: non JSON, o JSON che non è un oggetto.
            return problem(HttpStatus.BAD_REQUEST, "Il corpo non è un oggetto JSON");
        }
        if (!(document.get(listProperty) instanceof java.util.List<?>)) {
            return problem(HttpStatus.BAD_REQUEST, "Manca l'elenco " + listProperty + " (payload OTLP/HTTP JSON di " + signal + ")");
        }
        String clean = redactor.redact(payload);
        // In produzione qui si inoltra al collector OpenTelemetry; la reference implementation si limita a registrare.
        log.debug("Ricevuti {} ({} byte dopo la redazione)", signal, clean.length());
        return ResponseEntity.accepted().build();
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String title) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setTitle(title);
        return ResponseEntity.status(status).body(problem);
    }
}
