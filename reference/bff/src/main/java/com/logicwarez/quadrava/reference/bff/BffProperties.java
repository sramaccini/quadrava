package com.logicwarez.quadrava.reference.bff;

import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration of the reference BFF. Login, session, return pages and logout are configured under {@code authz.bff}
 * (authz-library); here only what the library leaves to the application: the forwarded APIs and who may do what.
 *
 * @param routes          forwarded APIs: every path prefix goes to one service only. No other host can be reached from
 *                        the browser through the BFF.
 * @param maxBodyBytes    maximum size of a forwarded body (files go up to 100 MB).
 * @param users           roles of every user, by login name. A user who is not listed cannot sign in (fail-closed).
 * @param rolePermissions permissions of every role (domain.resource.action), the same map as the reference authz service.
 * @param tenants         tenants the users may work on (optional, contracts/bff.yaml): none = no choice.
 * @param roles           label and base flag of the roles (ADR-28), as in the reference authz service: a base role always
 *                        applies, the others are operational, one at a time. A role that is not listed is operational.
 */
@ConfigurationProperties("quadrava.bff")
public record BffProperties(List<Route> routes, Long maxBodyBytes, Map<String, List<String>> users,
                            Map<String, List<String>> rolePermissions, List<Tenant> tenants,
                            Map<String, RoleInfo> roles) {

    public BffProperties {
        routes = routes == null ? List.of() : List.copyOf(routes);
        maxBodyBytes = maxBodyBytes == null ? 110L * 1024 * 1024 : maxBodyBytes;
        users = users == null ? Map.of() : Map.copyOf(users);
        rolePermissions = rolePermissions == null ? Map.of() : Map.copyOf(rolePermissions);
        tenants = tenants == null ? List.of() : List.copyOf(tenants);
        roles = roles == null ? Map.of() : Map.copyOf(roles);
    }

    /**
     * @param label name shown to the user (the identifier if absent)
     * @param base  whether the role always applies; otherwise it is an operational role, chosen one at a time
     */
    public record RoleInfo(String label, boolean base) {}

    /**
     * @param prefix forwarded path, for example {@code /registry}: it covers {@code /registry} and {@code /registry/...}
     * @param target address of the service, for example {@code http://localhost:8081}; the path stays that of the request
     */
    public record Route(String prefix, URI target) {

        boolean matches(String path) {
            return path.equals(prefix) || path.startsWith(prefix + "/");
        }
    }

    /**
     * @param id    identifier, forwarded to the services in the {@code X-Tenant} header
     * @param label name shown to the user
     * @param users usernames that may work on it; empty = everybody
     */
    public record Tenant(String id, String label, List<String> users) {

        public Tenant {
            users = users == null ? List.of() : List.copyOf(users);
        }
    }
}
