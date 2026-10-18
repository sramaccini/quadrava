package it.lowcode.reference.registry;

import it.lowcode.reference.registry.Model.DataSourcesReference;
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
 * Registry according to contracts/registry.yaml (0.5): separate documents for screens, navigation and themes, each with
 * its own versions and publications.
 *
 * <ul>
 *   <li>On save the content is validated against the schema of the document kind; with {@code If-Match} the save
 *       succeeds only if the latest version is still the one given (concurrent changes).</li>
 *   <li>Review: whoever writes requests the review; only someone with a role in
 *       {@code lowcode.registry.approver-roles} approves or rejects, and never the author of the version (four eyes).</li>
 *   <li>In the protected environments ({@code lowcode.registry.protected-environments}) only approved versions are
 *       published, and a navigation only if the screens it cites are published in the same environment.</li>
 *   <li>Cross-document references ({@link References}): {@code …/versions/{hash}/references} tells which screens a
 *       version cites and which are missing in an environment.</li>
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
                return problem(HttpStatus.BAD_REQUEST, "Unknown document kind");
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
                .orElseGet(() -> problem(HttpStatus.NOT_FOUND, "Unknown document"));
    }

    @PostMapping(path = "/registry/apps/{appId}/documents/{kind}/{documentId}/versions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> save(@PathVariable String appId, @PathVariable String kind, @PathVariable String documentId,
                                  @RequestBody String content,
                                  @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                  Principal principal) {
        Optional<DocumentKey> key = key(appId, kind, documentId);
        if (key.isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Invalid document kind or identifier");
        }
        Optional<String> invalid = checkContent(key.get(), content);
        if (invalid.isPresent()) {
            return problem(HttpStatus.BAD_REQUEST, invalid.get());
        }
        List<Issue> issues = validation.validate(key.get().kind(), content);
        if (!issues.isEmpty()) {
            ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
            problem.setTitle("The document does not match the schema");
            problem.setProperty("errors", issues);
            return ResponseEntity.badRequest().body(problem);
        }
        // Concurrent changes: whoever saves states the latest version they know.
        if (ifMatch != null && !ifMatch.isBlank() && !ifMatch.trim().equals("*")) {
            String expected = ifMatch.trim().replaceAll("^W/", "").replace("\"", "");
            Optional<DocumentVersion> latest = store.latest(key.get());
            if (latest.isEmpty() || !latest.get().hash().equals(expected)) {
                ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.PRECONDITION_FAILED);
                problem.setTitle("The document was changed by another save");
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
            return problem(HttpStatus.NOT_FOUND, "Unknown document");
        }
        String action = request.action() == null ? "" : request.action();
        if (!List.of("request", "approve", "reject").contains(action)) {
            return problem(HttpStatus.BAD_REQUEST, "Unknown review action");
        }
        Actor actor = Actor.of(principal);
        if (!action.equals("request")) {
            Optional<DocumentVersion> version = store.version(key.get(), hash);
            if (version.isEmpty()) {
                return problem(HttpStatus.NOT_FOUND, "Version not found");
            }
            if (actor.authenticated() && !actor.hasAnyRole(properties.approverRoles())) {
                return problem(HttpStatus.FORBIDDEN, "Only a reviewer can approve or reject");
            }
            if (actor.authenticated() && actor.name().equals(version.get().author())) {
                return problem(HttpStatus.FORBIDDEN, "The author of a version cannot approve or reject it");
            }
        }
        String note = request.note() == null ? null : request.note().strip();
        if (note != null && note.length() > 500) {
            return problem(HttpStatus.BAD_REQUEST, "Note too long (at most 500 characters)");
        }
        return switch (store.review(key.get(), hash, action, actor.name(), note)) {
            case ReviewOutcome.Done done -> ResponseEntity.ok(done.version());
            case ReviewOutcome.NotFound ignored -> problem(HttpStatus.NOT_FOUND, "Version not found");
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
            return problem(HttpStatus.BAD_REQUEST, "Invalid document kind or identifier");
        }
        if (!Model.IDENTIFIER.matcher(env).matches()) {
            return problem(HttpStatus.BAD_REQUEST, "Invalid environment");
        }
        Optional<DocumentVersion> version = request.hash() == null ? Optional.empty() : store.version(key.get(), request.hash());
        if (version.isEmpty()) {
            return problem(HttpStatus.BAD_REQUEST, "Version not found");
        }
        if (properties.protectedEnvironments().contains(env)) {
            if (!version.get().state().equals(State.APPROVED.value())) {
                return problem(HttpStatus.CONFLICT, "Only approved versions can be published in the «" + env + "» environment");
            }
            // A navigation with items pointing to screens missing from the environment is not published; for screens
            // missing references stay a warning (getReferences), because links between screens form cycles.
            if (key.get().kind() == Kind.NAVIGATION) {
                List<ScreenReference> missing = references(key.get(), request.hash(), env).missing();
                if (!missing.isEmpty()) {
                    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
                    problem.setTitle("The navigation cites screens not published in the «" + env + "» environment");
                    problem.setProperty("missingReferences", missing);
                    return ResponseEntity.status(HttpStatus.CONFLICT).body(problem);
                }
            }
            // A screen whose data sources documents are not published in the environment would open without its data.
            if (key.get().kind() == Kind.SCREEN) {
                List<DataSourcesReference> missing = references(key.get(), request.hash(), env).missingDataSources();
                if (!missing.isEmpty()) {
                    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
                    problem.setTitle("The screen uses data sources not published in the «" + env + "» environment");
                    problem.setProperty("missingDataSources", missing);
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
            return problem(HttpStatus.NOT_FOUND, "Version not found");
        }
        if (env != null && !Model.IDENTIFIER.matcher(env).matches()) {
            return problem(HttpStatus.BAD_REQUEST, "Invalid environment");
        }
        return ResponseEntity.ok(references(key.get(), hash, env));
    }

    /**
     * Screens and data sources documents cited by the version; missing are those not published in the environment (or with
     * no versions, if env is null).
     */
    private ReferenceReport references(DocumentKey key, String hash, String env) {
        String content = store.content(key, hash).orElseThrow();
        List<ScreenReference> all = References.of(key.kind(), key.documentId(), content);
        List<ScreenReference> missing = all.stream()
                .filter(r -> absent(new DocumentKey(key.appId(), Kind.SCREEN, r.screen()), env))
                .toList();
        if (key.kind() != Kind.SCREEN) {
            return new ReferenceReport(env, all, missing, null, null);
        }
        List<DataSourcesReference> sources = References.dataSourcesOf(key.kind(), content);
        List<DataSourcesReference> missingSources = sources.stream()
                .filter(r -> absent(new DocumentKey(key.appId(), Kind.DATASOURCES, r.datasources()), env))
                .toList();
        return new ReferenceReport(env, all, missing, sources, missingSources);
    }

    /** The document has no version published in the environment (or no version at all, if env is null). */
    private boolean absent(DocumentKey target, String env) {
        return env == null ? store.latest(target).isEmpty() : store.publishedHash(target, env).isEmpty();
    }

    private static Optional<DocumentKey> key(String appId, String kind, String documentId) {
        if (!Model.IDENTIFIER.matcher(appId).matches() || !Model.IDENTIFIER.matcher(documentId).matches()) {
            return Optional.empty();
        }
        return Kind.parse(kind).map(k -> new DocumentKey(appId, k, documentId));
    }

    /** Minimal checks on the content: a JSON object with schemaVersion and the identifier of the path. */
    static Optional<String> checkContent(DocumentKey key, String content) {
        Map<String, Object> document;
        try {
            document = JsonParserFactory.getJsonParser().parseMap(content);
        } catch (IllegalArgumentException e) {
            // Includes JsonParseException.
            return Optional.of("The content is not a JSON object");
        }
        if (!(document.get("schemaVersion") instanceof String)) {
            return Optional.of("schemaVersion is missing");
        }
        Object id = document.get(key.kind().idProperty());
        if (!key.documentId().equals(id)) {
            return Optional.of("The identifier in the content (" + key.kind().idProperty() + ") does not match the one in the path");
        }
        return Optional.empty();
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String title) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setTitle(title);
        return ResponseEntity.status(status).body(problem);
    }

    /**
     * Who makes the request: user name and roles of the Keycloak realm ({@code realm_access.roles}). Without
     * authentication (no-auth profile) it is «developer», with no roles and no review checks.
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
