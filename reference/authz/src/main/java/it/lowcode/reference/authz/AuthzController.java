package it.lowcode.reference.authz;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthzController {

    private static final String VERSION_HEADER = "X-Permissions-Version";

    private final CapabilitiesService service;

    public AuthzController(CapabilitiesService service) {
        this.service = service;
    }

    @GetMapping("/authz/capabilities")
    public ResponseEntity<Model.Capabilities> capabilities(@RequestParam("app") String app,
                                                           @AuthenticationPrincipal Jwt jwt) {
        Model.Capabilities capabilities = service.forRoles(rolesOf(jwt));
        return ResponseEntity.ok().header(VERSION_HEADER, capabilities.version()).body(capabilities);
    }

    @PostMapping("/authz/check")
    public ResponseEntity<Model.CheckResponse> check(@RequestBody Model.CheckRequest request,
                                                     @AuthenticationPrincipal Jwt jwt) {
        List<String> roles = rolesOf(jwt);
        return ResponseEntity.ok()
                .header(VERSION_HEADER, service.forRoles(roles).version())
                .body(service.check(roles, request));
    }

    /** Ruoli del realm Keycloak (claim realm_access.roles). */
    private static List<String> rolesOf(Jwt jwt) {
        Object realmAccess = jwt.getClaim("realm_access");
        if (realmAccess instanceof Map<?, ?> map && map.get("roles") instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return Collections.emptyList();
    }
}
