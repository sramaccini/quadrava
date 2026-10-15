package it.lowcode.reference.authz;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
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
    /** Permission format (domain.resource.action, lower case), as in the contract. */
    private static final Pattern PERMISSION = Pattern.compile("^[a-z0-9]+\\.[a-z0-9]+\\.[a-z0-9]+$");
    /** Maximum number of checks in a batch (maxItems of the contract). */
    static final int MAX_CHECKS = 200;

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
    public ResponseEntity<?> check(@RequestBody Model.CheckRequest request, @AuthenticationPrincipal Jwt jwt) {
        if (request == null || request.checks() == null) {
            return problem("The checks list is missing");
        }
        if (request.checks().size() > MAX_CHECKS) {
            return problem("Too many checks in a batch (at most " + MAX_CHECKS + ")");
        }
        for (Model.CheckItem item : request.checks()) {
            if (item == null || item.permission() == null || !PERMISSION.matcher(item.permission()).matches()) {
                return problem("Invalid permission: the format is domain.resource.action, lower case");
            }
        }
        List<String> roles = rolesOf(jwt);
        return ResponseEntity.ok()
                .header(VERSION_HEADER, service.forRoles(roles).version())
                .body(service.check(roles, request));
    }

    private static ResponseEntity<ProblemDetail> problem(String title) {
        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle(title);
        return ResponseEntity.badRequest().body(problem);
    }

    /** Roles of the Keycloak realm (claim realm_access.roles). */
    private static List<String> rolesOf(Jwt jwt) {
        Object realmAccess = jwt.getClaim("realm_access");
        if (realmAccess instanceof Map<?, ?> map && map.get("roles") instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return Collections.emptyList();
    }
}
