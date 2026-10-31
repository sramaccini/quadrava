package com.logicwarez.quadrava.reference.authz;

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

    private Set<String> permissionsOf(Collection<String> roles) {
        Set<String> permissions = new TreeSet<>();
        for (String role : roles) {
            permissions.addAll(properties.rolePermissions().getOrDefault(role, List.of()));
        }
        return permissions;
    }
}
