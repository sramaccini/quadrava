package it.lowcode.reference.registry;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration of the registry ({@code lowcode.registry.*}).
 *
 * @param storageDir folder of the file store; empty = in-memory store (lost on restart)
 * @param protectedEnvironments environments where only approved versions are published (usually testing and production)
 * @param approverRoles roles (Keycloak realm) of whoever may approve or reject a version in review
 */
@ConfigurationProperties("lowcode.registry")
public record RegistryProperties(String storageDir, List<String> protectedEnvironments, List<String> approverRoles) {

    public RegistryProperties {
        protectedEnvironments = protectedEnvironments == null ? List.of("testing", "production") : List.copyOf(protectedEnvironments);
        approverRoles = approverRoles == null ? List.of("manager", "administrator") : List.copyOf(approverRoles);
    }
}
