package it.lowcode.reference.authz;

import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Mappa ruolo -> permessi (formato dominio.risorsa.azione), configurata in application.yml. */
@ConfigurationProperties("lowcode.authz")
public record AuthzProperties(Map<String, List<String>> rolePermissions) {
    public AuthzProperties {
        rolePermissions = rolePermissions == null ? Map.of() : rolePermissions;
    }
}
