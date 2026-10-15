package it.lowcode.reference.registry;

import it.lowcode.reference.registry.Model.DocumentKey;
import it.lowcode.reference.registry.Model.DocumentVersion;
import it.lowcode.reference.registry.Model.Issue;
import it.lowcode.reference.registry.Model.Kind;
import it.lowcode.reference.registry.Model.ReferenceReport;
import it.lowcode.reference.registry.Model.ScreenReference;
import it.lowcode.reference.registry.Model.State;
import it.lowcode.reference.registry.VersionStore.ReviewOutcome;
import java.security.Principal;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Registry secondo contracts/registry.yaml (0.5): documenti separati per schermate, navigazione e temi, ognuno con le
 * proprie versioni e pubblicazioni.
 *
 * <ul>
 *   <li>Al salvataggio il contenuto si valida contro lo schema del tipo di documento; con {@code If-Match} il
 *       salvataggio riesce solo se l'ultima versione è ancora quella indicata (modifiche concorrenti).</li>
 *   <li>Revisione: chi scrive chiede la revisione; approva o respinge solo chi ha un ruolo di
 *       {@code lowcode.registry.approver-roles}, e mai l'autore della versione (quattro occhi).</li>
 *   <li>Negli ambienti protetti ({@code lowcode.registry.protected-environments}) si pubblicano solo versioni
 *       approvate, e una navigazione solo se le schermate che cita sono pubblicate nello stesso ambiente.</li>
 *   <li>Riferimenti tra documenti ({@link References}): {@code …/versions/{hash}/references} dice quali schermate
 *       cita una versione e quali mancano in un ambiente.</li>
 * </ul>
 */
@RestController
public class RegistryController {

    private final VersionStore store;
    private final SchemaValidation validation;
    private final RegistryProperties properties;

    public RegistryController(VersionStore store, SchemaValidation validation, RegistryProperties properties) {
        this.store = store;
        this.validation = validation;
        this.properties = properties;
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
                .map(k -> new Model.DocumentSummary(k.kind().value(), k.documentId(), store.latest(k).orElse(null), store.publishedEnvironments(k)))
                .toList();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/registry/apps/{appId}/documents/{kind}/{documentId}/versions")
    public ResponseEntity<?> versions(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId) {
        return key(appId, kind, documentId)
                .<ResponseEntity<?>>map(k -> ResponseEntity.ok(store.versions(k)))
                .orElseGet(() -> problem(HttpStatus.NOT_FOUND, "Documento sconosciuto"));
    }

    @PostMapping(path = "/registry/apps/{appId}/documents/{kind}/{documentId}/versions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> save(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                  @RequestBody String content,
                                  @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                  Principal principal) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        if (key.isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Tipo di documento o identificativo non valido");
        }
        Optional<String> invalid = checkContent(key.get(), content);
        if (invalid.isPresent()) {
            return problem(HttpStatus.BAD_REQUEST, invalid.get());
        }
        List<Issue> issues = validation.validate(key.get().kind(), content);
        if (!issues.isEmpty()) {
            ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
            problem.setTitle("Il documento non rispetta lo schema");
            problem.setProperty("errors", issues);
            return ResponseEntity.badRequest().body(problem);
        }
        // Modifiche concorrenti: chi salva indica l'ultima versione che conosce.
        if (ifMatch != null && !ifMatch.isBlank() && !ifMatch.trim().equals("*")) {
            String expected = ifMatch.trim().replaceAll("^W/", "").replace("\"", "");
            Optional<DocumentVersion> latest = store.latest(key.get());
            if (latest.isEmpty() || !latest.get().hash().equals(expected)) {
                ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.PRECONDITION_FAILED);
                problem.setTitle("Il documento è stato modificato da un altro salvataggio");
                latest.ifPresent(v -> {
                    problem.setProperty("latest", v.hash());
                    problem.setProperty("latestAuthor", v.author());
                });
                return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).body(problem);
            }
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(store.save(key.get(), content, Actor.of(principal).name()));
    }

    @GetMapping(path = "/registry/apps/{appId}/documents/{kind}/{documentId}/versions/{hash}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> version(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                          @PathVariable String hash) {
        return key(appId, kind, documentId)
                .flatMap(k -> store.content(k, hash))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/registry/apps/{appId}/documents/{kind}/{documentId}/versions/{hash}/review")
    public ResponseEntity<?> review(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                    @PathVariable String hash, @RequestBody Model.ReviewRequest request, Principal principal) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        if (key.isEmpty()) {
            return problem(HttpStatus.NOT_FOUND, "Documento sconosciuto");
        }
        String action = request.action() == null ? "" : request.action();
        if (!List.of("request", "approve", "reject").contains(action)) {
            return problem(HttpStatus.BAD_REQUEST, "Azione di revisione sconosciuta");
        }
        Actor actor = Actor.of(principal);
        if (!action.equals("request")) {
            Optional<DocumentVersion> version = store.version(key.get(), hash);
            if (version.isEmpty()) {
                return problem(HttpStatus.NOT_FOUND, "Versione inesistente");
            }
            if (actor.authenticated() && !actor.hasAnyRole(properties.approverRoles())) {
                return problem(HttpStatus.FORBIDDEN, "Solo un revisore può approvare o respingere");
            }
            if (actor.authenticated() && actor.name().equals(version.get().author())) {
                return problem(HttpStatus.FORBIDDEN, "L'autore di una versione non può approvarla né respingerla");
            }
        }
        String note = request.note() == null ? null : request.note().strip();
        if (note != null && note.length() > 500) {
            return problem(HttpStatus.BAD_REQUEST, "Nota troppo lunga (al massimo 500 caratteri)");
        }
        return switch (store.review(key.get(), hash, action, actor.name(), note)) {
            case ReviewOutcome.Done done -> ResponseEntity.ok(done.version());
            case ReviewOutcome.NotFound ignored -> problem(HttpStatus.NOT_FOUND, "Versione inesistente");
            case ReviewOutcome.NotAllowed notAllowed -> problem(HttpStatus.CONFLICT, notAllowed.reason());
        };
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
            return problem(HttpStatus.BAD_REQUEST, "Tipo di documento o identificativo non valido");
        }
        if (!Model.IDENTIFIER.matcher(env).matches()) {
            return problem(HttpStatus.BAD_REQUEST, "Ambiente non valido");
        }
        Optional<DocumentVersion> version = request.hash() == null ? Optional.empty() : store.version(key.get(), request.hash());
        if (version.isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Versione inesistente");
        }
        if (properties.protectedEnvironments().contains(env)) {
            if (!version.get().state().equals(State.APPROVED.value())) {
                return problem(HttpStatus.CONFLICT, "Nell'ambiente «" + env + "» si pubblicano solo versioni approvate");
            }
            // Una navigazione con voci verso schermate assenti nell'ambiente non si pubblica; per le schermate i
            // riferimenti mancanti restano un avviso (getReferences), perché i collegamenti tra schermate fanno cicli.
            if (key.get().kind() == Kind.NAVIGATION) {
                List<ScreenReference> missing = references(key.get(), request.hash(), env).missing();
                if (!missing.isEmpty()) {
                    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
                    problem.setTitle("La navigazione cita schermate non pubblicate nell'ambiente «" + env + "»");
                    problem.setProperty("missingReferences", missing);
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
                }
            }
        }
        store.publish(key.get(), env, request.hash());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/registry/apps/{appId}/documents/{kind}/{documentId}/versions/{hash}/references")
    public ResponseEntity<?> references(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                        @PathVariable String hash, @RequestParam(value = "env", required = false) String env) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        if (key.isEmpty() || store.version(key.get(), hash).isEmpty()) {
            return problem(HttpStatus.NOT_FOUND, "Versione inesistente");
        }
        if (env != null && !Model.IDENTIFIER.matcher(env).matches()) {
            return problem(HttpStatus.BAD_REQUEST, "Ambiente non valido");
        }
        return ResponseEntity.ok(references(key.get(), hash, env));
    }

    /** Schermate citate dalla versione; mancano quelle senza pubblicazione nell'ambiente (o senza versioni, se env è null). */
    private ReferenceReport references(DocumentKey key, String hash, String env) {
        List<ScreenReference> all = References.of(key.kind(), key.documentId(), store.content(key, hash).orElseThrow());
        List<ScreenReference> missing = all.stream().filter(r -> {
            DocumentKey target = new DocumentKey(key.appId(), Kind.SCREEN, r.screen());
            return env == null ? store.latest(target).isEmpty() : store.publishedHash(target, env).isEmpty();
        }).toList();
        return new ReferenceReport(env, all, missing);
    }

    private static Optional<DocumentKey> key(String appId, String kind, String documentId) {
        if (!Model.IDENTIFIER.matcher(appId).matches() || !Model.IDENTIFIER.matcher(documentId).matches()) {
            return Optional.empty();
        }
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

    /**
     * Chi fa la richiesta: nome utente e ruoli del realm di Keycloak ({@code realm_access.roles}). Senza autenticazione
     * (profilo no-auth) è «developer», senza ruoli né controlli di revisione.
     */
    record Actor(String name, List<String> roles, boolean authenticated) {

        static Actor of(Principal principal) {
            if (principal == null) {
                return new Actor("developer", List.of(), false);
            }
            List<String> roles = List.of();
            if (principal instanceof JwtAuthenticationToken jwt && jwt.getToken().getClaim("realm_access") instanceof Map<?, ?> access
                    && access.get("roles") instanceof Collection<?> values) {
                roles = values.stream().map(String::valueOf).toList();
            }
            return new Actor(principal.getName(), roles, true);
        }

        boolean hasAnyRole(List<String> wanted) {
            return roles.stream().anyMatch(wanted::contains);
        }
    }
}
