package com.logicwarez.quadrava.reference.bff;

import java.net.URI;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration of the BFF.
 *
 * @param routes          forwarded APIs: every path prefix goes to one service only. No other host can be reached from
 *                        the browser through the BFF.
 * @param frontendOrigins origins of the applications (runtime, editor) the user may return to after the login.
 * @param maxBodyBytes    maximum size of a forwarded body (files go up to 100 MB).
 * @param home            where the user goes after a login without a return page, and whoever opens the BFF root.
 * @param endSessionUri   Keycloak OIDC logout, to close its session too when signing out.
 * @param tenants         tenants the users may work on (optional, contracts/bff.yaml): none = no choice.
 */
@ConfigurationProperties("quadrava.bff")
public record BffProperties(List<Route> routes, List<String> frontendOrigins, Long maxBodyBytes, String home, String endSessionUri,
                           List<Tenant> tenants) {

    public BffProperties {
        routes = routes == null ? List.of() : List.copyOf(routes);
        frontendOrigins = frontendOrigins == null ? List.of() : List.copyOf(frontendOrigins);
        maxBodyBytes = maxBodyBytes == null ? 110L * 1024 * 1024 : maxBodyBytes;
        home = home == null ? "/" : home;
        tenants = tenants == null ? List.of() : List.copyOf(tenants);
    }

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
