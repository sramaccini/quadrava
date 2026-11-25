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
 *   <li>A user with operational roles (ADR-28) works as one of them: the one chosen, else the last one used, else the
 *   first of the user's list. The permissions are those of the base roles plus the active one.</li>
 * </ul>
 */
@Component
public class ConfiguredAuthorization implements AuthorizationResolver {

    private final BffProperties properties;
    /** Last tenant chosen by each user. In memory, like everything in the reference BFF: lost at restart. */
    private final Map<String, String> lastUsed = new ConcurrentHashMap<>();
    /** Last operational role chosen by each user, in memory too. */
    private final Map<String, String> lastRole = new ConcurrentHashMap<>();

    public ConfiguredAuthorization(BffProperties properties) {
        this.properties = properties;
    }

    @Override
    public Resolved resolve(String username, String requestedTenant) {
        return resolve(username, requestedTenant, null);
    }

    @Override
    public Resolved resolve(String username, String requestedTenant, String preferredRole) {
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
        List<String> operational = roles.stream().filter(role -> !isBase(role)).toList();
        String current = null;
        if (!operational.isEmpty()) {
            if (preferredRole != null && operational.contains(preferredRole)) {
                current = preferredRole;
                lastRole.put(username, current);
            } else {
                String last = lastRole.get(username);
                current = last != null && operational.contains(last) ? last : operational.getFirst();
            }
        }
        String active = current;
        TreeSet<String> permissions = new TreeSet<>();
        roles.stream()
                .filter(role -> active == null || isBase(role) || role.equals(active))
                .forEach(role -> permissions.addAll(properties.rolePermissions().getOrDefault(role, List.of())));
        List<SessionContext.Role> offeredRoles = operational.stream().map(role -> new SessionContext.Role(role, label(role))).toList();
        return new Resolved(username, null, tenant, offered, List.copyOf(roles), List.copyOf(permissions), offeredRoles, current);
    }

    private boolean isBase(String role) {
        BffProperties.RoleInfo info = properties.roles().get(role);
        return info != null && info.base();
    }

    private String label(String role) {
        BffProperties.RoleInfo info = properties.roles().get(role);
        return info != null && info.label() != null ? info.label() : role;
    }

    private static Optional<String> find(List<SessionContext.Tenant> offered, String id) {
        return offered.stream().map(SessionContext.Tenant::id).filter(t -> t.equals(id)).findFirst();
    }
}
