package it.lowcode.reference.registry;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configurazione del registro ({@code lowcode.registry.*}).
 *
 * @param storageDir cartella dell'archivio su file; vuota = archivio in memoria (si perde al riavvio)
 * @param protectedEnvironments ambienti in cui si pubblicano solo versioni approvate (di norma collaudo e produzione)
 * @param approverRoles ruoli (realm di Keycloak) di chi può approvare o respingere una versione in revisione
 */
@ConfigurationProperties("lowcode.registry")
public record RegistryProperties(String storageDir, List<String> protectedEnvironments, List<String> approverRoles) {

    public RegistryProperties {
        protectedEnvironments = protectedEnvironments == null ? List.of("collaudo", "produzione") : List.copyOf(protectedEnvironments);
        approverRoles = approverRoles == null ? List.of("responsabile", "amministratore") : List.copyOf(approverRoles);
    }
}
