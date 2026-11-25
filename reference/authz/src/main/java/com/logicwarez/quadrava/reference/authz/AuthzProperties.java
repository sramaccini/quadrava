package com.logicwarez.quadrava.reference.authz;

import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Role → permissions map (domain.resource.action format) and, optionally, the label and the base flag of each role
 * (ADR-28), configured in application.yml. A role with permissions but no entry in {@code roles} is an operational role
 * labelled with its identifier.
 */
@ConfigurationProperties("quadrava.authz")
public record AuthzProperties(Map<String, List<String>> rolePermissions, Map<String, RoleInfo> roles) {
    public AuthzProperties {
        rolePermissions = rolePermissions == null ? Map.of() : rolePermissions;
        roles = roles == null ? Map.of() : roles;
    }

    /** Label shown to the user and whether the role always applies (base) or is chosen one at a time (operational). */
    public record RoleInfo(String label, boolean base) {}
}
