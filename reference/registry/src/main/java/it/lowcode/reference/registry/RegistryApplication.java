package it.lowcode.reference.registry;

import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@EnableConfigurationProperties(RegistryProperties.class)
public class RegistryApplication {
    public static void main(String[] args) {
        SpringApplication.run(RegistryApplication.class, args);
    }

    /** Archivio su file se è indicata una cartella, altrimenti in memoria. */
    @Bean
    VersionStore versionStore(RegistryProperties properties) {
        String dir = properties.storageDir();
        return dir == null || dir.isBlank() ? new VersionStore() : new VersionStore(Path.of(dir));
    }
}
