package it.lowcode.reference.registry;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/** Tipi del contratto contracts/registry.yaml. */
public final class Model {
    private Model() {}

    /** Tipo di documento: decide lo schema di validazione e la proprietà che ne contiene l'identificativo. */
    public enum Kind {
        SCREEN("screen"),
        NAVIGATION("navigation"),
        THEME("theme");

        private final String idProperty;

        Kind(String idProperty) {
            this.idProperty = idProperty;
        }

        /** Proprietà del contenuto con l'identificativo del documento (`screen`, `navigation`, `theme`). */
        public String idProperty() {
            return idProperty;
        }

        public String value() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static Optional<Kind> parse(String value) {
            for (Kind kind : values()) {
                if (kind.value().equals(value)) {
                    return Optional.of(kind);
                }
            }
            return Optional.empty();
        }
    }

    /** Un documento di un'applicazione. */
    public record DocumentKey(String appId, Kind kind, String documentId) {}

    public record AppSummary(String id, String name, int documentCount) {}

    public record DocumentVersion(String hash, Instant createdAt, String author, String state) {}

    public record DocumentSummary(String kind, String id, DocumentVersion latest, Map<String, String> publishedEnvironments) {}

    public record PublishRequest(String hash) {}
}
