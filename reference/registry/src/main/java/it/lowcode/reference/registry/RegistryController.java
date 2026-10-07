package it.lowcode.reference.registry;

import java.security.Principal;
import java.util.List;
import org.springframework.http.MediaType;
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
 * Registry secondo contracts/registry.yaml. La reference implementation non valida il JSON contro lo schema:
 * in un'implementazione reale la validazione avviene qui, al salvataggio.
 */
@RestController
public class RegistryController {

    private final VersionStore store;

    public RegistryController(VersionStore store) {
        this.store = store;
    }

    @GetMapping("/registry/apps")
    public List<Model.AppSummary> apps() {
        return store.appIds().stream()
                .sorted()
                .map(id -> new Model.AppSummary(id, id, store.publishedEnvironments(id)))
                .toList();
    }

    @GetMapping("/registry/apps/{appId}/versions")
    public List<Model.AppVersion> versions(@PathVariable String appId) {
        return store.versions(appId);
    }

    @PostMapping(path = "/registry/apps/{appId}/versions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Model.AppVersion> save(@PathVariable String appId, @RequestBody String definition,
                                                 Principal principal) {
        Model.AppVersion version = store.save(appId, definition, principal.getName());
        return ResponseEntity.status(201).body(version);
    }

    @GetMapping(path = "/registry/apps/{appId}/versions/{hash}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> version(@PathVariable String appId, @PathVariable String hash) {
        return store.content(appId, hash).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping(path = "/registry/apps/{appId}/published", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> published(@PathVariable String appId, @RequestParam("env") String env,
                                            @RequestHeader(value = "If-None-Match", required = false) String ifNoneMatch) {
        return store.publishedHash(appId, env).map(hash -> {
            String etag = "\"" + hash + "\"";
            if (etag.equals(ifNoneMatch)) {
                return ResponseEntity.status(304).<String>build();
            }
            String body = store.content(appId, hash).orElseThrow();
            return ResponseEntity.ok().eTag(etag).body(body);
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/registry/apps/{appId}/published")
    public ResponseEntity<Void> publish(@PathVariable String appId, @RequestParam("env") String env,
                                        @RequestBody Model.PublishRequest request) {
        boolean ok = store.publish(appId, env, request.hash());
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.badRequest().build();
    }
}
