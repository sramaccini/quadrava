package it.lowcode.reference.registry;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/** Tipi del contratto contracts/registry.yaml. */
public final class Model {
    private Model() {}

    /**
     * Identificativi di applicazioni e documenti: kebab-case. Finiscono anche nei percorsi dell'archivio su file,
     * quindi nient'altro è ammesso (niente {@code ..}, barre o caratteri speciali).
     */
    public static final Pattern IDENTIFIER = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    /** Tipo di documento: decide lo schema di validazione e la proprietà che ne contiene l'identificativo. */
    public enum Kind {
        SCREEN("screen"),
        NAVIGATION("navigation"),
        THEME("theme"),
        /** Catalogo delle traduzioni di una lingua: l'identificativo è la lingua (it, en, pt-br). */
        MESSAGES("messages");

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

    /** Stato di revisione di una versione. */
    public enum State {
        BOZZA("bozza"),
        IN_REVISIONE("in-revisione"),
        APPROVATA("approvata"),
        RESPINTA("respinta");

        private final String value;

        State(String value) {
            this.value = value;
        }

        public String value() {
            return value;
        }
    }

    /** Un documento di un'applicazione. */
    public record DocumentKey(String appId, Kind kind, String documentId) {}

    public record AppSummary(String id, String name, int documentCount) {}

    /** Una versione: immutabile nel contenuto; cambia solo lo stato di revisione. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DocumentVersion(String hash, Instant createdAt, String author, String state,
                                  String reviewedBy, Instant reviewedAt, String reviewNote) {

        public DocumentVersion(String hash, Instant createdAt, String author, String state) {
            this(hash, createdAt, author, state, null, null, null);
        }

        DocumentVersion withReview(State next, String reviewer, String note) {
            boolean decision = next == State.APPROVATA || next == State.RESPINTA;
            return new DocumentVersion(hash, createdAt, author, next.value(),
                    decision ? reviewer : null, decision ? Instant.now() : null, decision ? note : null);
        }
    }

    public record DocumentSummary(String kind, String id, DocumentVersion latest, Map<String, String> publishedEnvironments) {}

    public record PublishRequest(String hash) {}

    /** Azione di revisione: {@code richiedi} (bozza o respinta → in revisione), {@code approva}, {@code respingi}. */
    public record ReviewRequest(String action, String note) {}

    /** Un problema di validazione: posizione nel documento (JSON Pointer) e messaggio. */
    public record Issue(String path, String message) {}
}
