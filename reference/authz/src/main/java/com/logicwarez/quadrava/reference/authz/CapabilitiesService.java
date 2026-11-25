package com.logicwarez.quadrava.reference.authz;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Service;

@Service
public class CapabilitiesService {

    private static final int TTL_SECONDS = 300;

    private final AuthzProperties properties;

    public CapabilitiesService(AuthzProperties properties) {
        this.properties = properties;
    }

    public Model.Capabilities forRoles(Collection<String> roles) {
        Set<String> permissions = permissionsOf(roles);
        String version = Integer.toHexString(permissions.hashCode());
        return new Model.Capabilities(List.copyOf(permissions), version, TTL_SECONDS);
    }

    public Model.CheckResponse check(Collection<String> roles, Model.CheckRequest request) {
        Set<String> permissions = permissionsOf(roles);
        List<Model.CheckResult> results = request.checks().stream()
                .map(c -> new Model.CheckResult(c.permission(), c.resource(), permissions.contains(c.permission())))
                .toList();
        return new Model.CheckResponse(results);
    }

    /** The roles of the user this service knows (with permissions or described in {@code roles}), in their order. */
    public List<Model.Role> rolesOf(Collection<String> userRoles) {
        return userRoles.stream()
                .distinct()
                .filter(id -> properties.rolePermissions().containsKey(id) || properties.roles().containsKey(id))
                .map(id -> {
                    AuthzProperties.RoleInfo info = properties.roles().get(id);
                    String label = info != null && info.label() != null && !info.label().isBlank() ? info.label() : id;
                    return new Model.Role(id, label, info != null && info.base());
                })
                .toList();
    }

    /**
     * The roles an answer covers (ADR-28): without an operational role all those of the user; with one, the base roles
     * of the user plus that role, if it is one of the user's operational roles. Any other role adds nothing (fail-closed).
     */
    public List<String> effectiveRoles(Collection<String> userRoles, String role) {
        if (role == null) {
            return List.copyOf(userRoles);
        }
        List<String> roles = new ArrayList<>();
        for (Model.Role known : rolesOf(userRoles)) {
            if (known.base() || known.id().equals(role)) {
                roles.add(known.id());
            }
        }
        return roles;
    }

    private Set<String> permissionsOf(Collection<String> roles) {
        Set<String> permissions = new TreeSet<>();
        for (String role : roles) {
            permissions.addAll(properties.rolePermissions().getOrDefault(role, List.of()));
        }
        return permissions;
    }
}
