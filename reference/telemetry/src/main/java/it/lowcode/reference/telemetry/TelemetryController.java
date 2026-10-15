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
 * OTLP/HTTP (JSON) ingestion of traces and logs, according to contracts/telemetry.yaml. The body must be a JSON object
 * with the list of its signal (`resourceSpans` for traces, `resourceLogs` for logs); errors are Problems.
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
            return problem(HttpStatus.CONTENT_TOO_LARGE, "Body over the limit of " + maxBytes + " bytes");
        }
        Map<String, Object> document;
        try {
            document = JsonParserFactory.getJsonParser().parseMap(payload);
        } catch (IllegalArgumentException e) {
            // Includes JsonParseException: not JSON, or JSON that is not an object.
            return problem(HttpStatus.BAD_REQUEST, "The body is not a JSON object");
        }
        if (!(document.get(listProperty) instanceof java.util.List<?>)) {
            return problem(HttpStatus.BAD_REQUEST, "The " + listProperty + " list is missing (OTLP/HTTP JSON payload of " + signal + ")");
        }
        String clean = redactor.redact(payload);
        // In production this is where the payload goes to the OpenTelemetry collector; the reference implementation only logs it.
        log.debug("Received {} ({} bytes after redaction)", signal, clean.length());
        return ResponseEntity.accepted().build();
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String title) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setTitle(title);
        return ResponseEntity.status(status).body(problem);
    }
}
