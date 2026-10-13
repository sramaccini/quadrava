package it.lowcode.reference.registry;

import it.lowcode.reference.registry.Model.DocumentKey;
import it.lowcode.reference.registry.Model.Kind;
import java.security.Principal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Registry secondo contracts/registry.yaml: documenti separati per schermate, navigazione e temi, ognuno con le
 * proprie versioni e pubblicazioni. Al salvataggio controlla che il contenuto sia un oggetto JSON con
 * {@code schemaVersion} e con l'identificativo uguale a quello del percorso. La validazione completa contro lo schema
 * del tipo di documento (screen/navigation/theme.schema.json) spetta a un'implementazione reale, qui al salvataggio.
 */
@RestController
public class RegistryController {

    private final VersionStore store;

    public RegistryController(VersionStore store) {
        this.store = store;
    }

    @GetMapping("/registry/apps")
    public List<Model.AppSummary> apps() {
        return store.appIds().stream().map(id -> new Model.AppSummary(id, id, store.documents(id).size())).toList();
    }

    @GetMapping("/registry/apps/{appId}/documents")
    public ResponseEntity<?> documents(@PathVariable String appId, @RequestParam(value = "kind", required = false) String kind) {
        Optional<Kind> filter = Optional.empty();
        if (kind != null) {
            filter = Kind.parse(kind);
            if (filter.isEmpty()) {
                return problem(HttpStatus.BAD_REQUEST, "Tipo di documento sconosciuto");
            }
        }
        Optional<Kind> only = filter;
        List<Model.DocumentSummary> result = store.documents(appId).stream()
                .filter(k -> only.map(k.kind()::equals).orElse(true))
                .sorted(Comparator.comparing((DocumentKey k) -> k.kind().ordinal()).thenComparing(DocumentKey::documentId))
                .map(k -> new Model.DocumentSummary(k.kind().value(), k.documentId(),
                        store.versions(k).stream().findFirst().orElse(null), store.publishedEnvironments(k)))
                .toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/registry/apps/{appId}/documents/{kind}/{documentId}/versions")
    public ResponseEntity<?> versions(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId) {
        return key(appId, kind, documentId)
                .<ResponseEntity<?>>map(k -> ResponseEntity.ok(store.versions(k)))
                .orElseGet(() -> problem(HttpStatus.NOT_FOUND, "Tipo di documento sconosciuto"));
    }

    @PostMapping(path = "/registry/apps/{appId}/documents/{kind}/{documentId}/versions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> save(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                  @RequestBody String content, Principal principal) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        if (key.isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Tipo di documento sconosciuto");
        }
        Optional<String> invalid = checkContent(key.get(), content);
        if (invalid.isPresent()) {
            return problem(HttpStatus.BAD_REQUEST, invalid.get());
        }
        // Senza autenticazione (profilo senza-auth) l'autore è «sviluppo».
        String author = principal == null ? "sviluppo" : principal.getName();
        return ResponseEntity.status(HttpStatus.CREATED).body(store.save(key.get(), content, author));
    }

    @GetMapping(path = "/registry/apps/{appId}/documents/{kind}/{documentId}/versions/{hash}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> version(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                          @PathVariable String hash) {
        return key(appId, kind, documentId)
                .flatMap(k -> store.content(k, hash))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping(path = "/registry/apps/{appId}/documents/{kind}/{documentId}/published", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> published(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                            @RequestParam("env") String env,
                                            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        return key.flatMap(k -> store.publishedHash(k, env)).map(hash -> {
            String etag = "\"" + hash + "\"";
            if (etag.equals(ifNoneMatch)) {
                return ResponseEntity.status(HttpStatus.NOT_MODIFIED).<String>build();
            }
            String body = store.content(key.get(), hash).orElseThrow();
            return ResponseEntity.ok().eTag(etag).body(body);
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/registry/apps/{appId}/documents/{kind}/{documentId}/published")
    public ResponseEntity<?> publish(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                     @RequestParam("env") String env, @RequestBody Model.PublishRequest request) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        if (key.isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Tipo di documento sconosciuto");
        }
        return store.publish(key.get(), env, request.hash())
                ? ResponseEntity.noContent().build()
                : problem(HttpStatus.BAD_REQUEST, "Versione inesistente");
    }

    private static Optional<DocumentKey> key(String appId, String kind, String documentId) {
        return Kind.parse(kind).map(k -> new DocumentKey(appId, k, documentId));
    }

    /** Controlli minimi sul contenuto: oggetto JSON con schemaVersion e con l'identificativo del percorso. */
    static Optional<String> checkContent(DocumentKey key, String content) {
        Map<String, Object> document;
        try {
            document = JsonParserFactory.getJsonParser().parseMap(content);
        } catch (IllegalArgumentException e) {
            // Comprende JsonParseException.
            return Optional.of("Il contenuto non è un oggetto JSON");
        }
        if (!(document.get("schemaVersion") instanceof String)) {
            return Optional.of("Manca schemaVersion");
        }
        Object id = document.get(key.kind().idProperty());
        if (!key.documentId().equals(id)) {
            return Optional.of("L'identificativo nel contenuto (" + key.kind().idProperty() + ") non coincide con quello del percorso");
        }
        return Optional.empty();
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String title) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setTitle(title);
        return ResponseEntity.status(status).body(problem);
    }
}
