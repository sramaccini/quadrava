package it.lowcode.reference.bff;

import java.net.URI;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configurazione del BFF.
 *
 * @param routes          API inoltrate: ogni prefisso del percorso va a un solo servizio. Nessun altro host è
 *                        raggiungibile dal browser attraverso il BFF.
 * @param frontendOrigins origini delle applicazioni (runtime, editor) verso cui si può tornare dopo il login.
 * @param maxBodyBytes    dimensione massima del corpo inoltrato (i file arrivano fino a 100 MB).
 */
@ConfigurationProperties("lowcode.bff")
public record BffProperties(List<Route> routes, List<String> frontendOrigins, Long maxBodyBytes) {

    public BffProperties {
        routes = routes == null ? List.of() : List.copyOf(routes);
        frontendOrigins = frontendOrigins == null ? List.of() : List.copyOf(frontendOrigins);
        maxBodyBytes = maxBodyBytes == null ? 110L * 1024 * 1024 : maxBodyBytes;
    }

    /**
     * @param prefix percorso inoltrato, per esempio {@code /registry}: vale per {@code /registry} e {@code /registry/...}
     * @param target indirizzo del servizio, per esempio {@code http://localhost:8081}; il percorso resta quello della richiesta
     */
    public record Route(String prefix, URI target) {

        boolean matches(String path) {
            return path.equals(prefix) || path.startsWith(prefix + "/");
        }
    }
}
