package it.lowcode.reference.authz;

import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Role → permissions map (domain.resource.action format), configured in application.yml. */
@ConfigurationProperties("lowcode.authz")
public record AuthzProperties(Map<String, List<String>> rolePermissions) {
    public AuthzProperties {
        rolePermissions = rolePermissions == null ? Map.of() : rolePermissions;
    }
}
