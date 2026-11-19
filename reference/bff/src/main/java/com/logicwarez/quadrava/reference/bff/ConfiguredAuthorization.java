package com.logicwarez.quadrava.reference.bff;

import com.logicwarez.authz.session.AuthorizationResolver;
import com.logicwarez.authz.session.SessionContext;
import com.logicwarez.authz.session.UserNotAuthorizedException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Roles, permissions and tenants of the users, from the configuration ({@link BffProperties}): authz-library calls it at
 * the login and when the user switches tenant, and keeps the result in the session. The permissions do not come from
 * the token of the identity provider: Keycloak only says who the user is.
 *
 * <ul>
 *   <li>A user who is not in {@code quadrava.bff.users}, or has no roles, cannot sign in.</li>
 *   <li>The login opens the session on the last tenant the user chose, or on the first one offered: it never asks.</li>
 * </ul>
 */
@Component
public class ConfiguredAuthorization implements AuthorizationResolver {

    private final BffProperties properties;
    /** Last tenant chosen by each user. In memory, like everything in the reference BFF: lost at restart. */
    private final Map<String, String> lastUsed = new ConcurrentHashMap<>();

    public ConfiguredAuthorization(BffProperties properties) {
        this.properties = properties;
    }

    @Override
    public Resolved resolve(String username, String requestedTenant) {
        List<String> roles = properties.users().getOrDefault(username, List.of());
        if (roles.isEmpty()) {
            throw new UserNotAuthorizedException("User not configured: " + username);
        }
        List<SessionContext.Tenant> offered = properties.tenants().stream()
                .filter(t -> t.users().isEmpty() || t.users().contains(username))
                .map(t -> new SessionContext.Tenant(t.id(), t.label()))
                .toList();
        String tenant = null;
        if (requestedTenant != null) {
            tenant = find(offered, requestedTenant).orElseThrow(() -> new UserNotAuthorizedException("Tenant not offered: " + requestedTenant));
            lastUsed.put(username, tenant);
        } else if (!offered.isEmpty()) {
            tenant = find(offered, lastUsed.get(username)).orElse(offered.getFirst().id());
        }
        TreeSet<String> permissions = new TreeSet<>();
        roles.forEach(role -> permissions.addAll(properties.rolePermissions().getOrDefault(role, List.of())));
        return new Resolved(username, null, tenant, offered, List.copyOf(roles), List.copyOf(permissions));
    }

    private static Optional<String> find(List<SessionContext.Tenant> offered, String id) {
        return offered.stream().map(SessionContext.Tenant::id).filter(t -> t.equals(id)).findFirst();
    }
}
