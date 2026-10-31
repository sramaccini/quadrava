package com.logicwarez.quadrava.reference.authz;

import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Role → permissions map (domain.resource.action format), configured in application.yml. */
@ConfigurationProperties("quadrava.authz")
public record AuthzProperties(Map<String, List<String>> rolePermissions) {
    public AuthzProperties {
        rolePermissions = rolePermissions == null ? Map.of() : rolePermissions;
    }
}
