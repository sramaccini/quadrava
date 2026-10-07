package it.lowcode.reference.telemetry;

import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Ingestione OTLP/HTTP (JSON) di tracce e log, secondo contracts/telemetry.yaml. */
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
    public ResponseEntity<Void> traces(@RequestBody String payload) {
        return accept("traces", payload);
    }

    @PostMapping(path = "/telemetry/v1/logs", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> logs(@RequestBody String payload) {
        return accept("logs", payload);
    }

    private ResponseEntity<Void> accept(String signal, String payload) {
        if (payload.getBytes(StandardCharsets.UTF_8).length > maxBytes) {
            return ResponseEntity.status(413).build();
        }
        String clean = redactor.redact(payload);
        // In produzione qui si inoltra al collector OpenTelemetry; la reference implementation si limita a registrare.
        log.debug("Ricevuti {} ({} byte dopo la redazione)", signal, clean.length());
        return ResponseEntity.accepted().build();
    }
}
