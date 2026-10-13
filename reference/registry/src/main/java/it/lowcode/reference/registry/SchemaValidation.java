package it.lowcode.reference.registry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaValidatorsConfig;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import it.lowcode.reference.registry.Model.Issue;
import it.lowcode.reference.registry.Model.Kind;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Valida i documenti contro lo schema del loro tipo (screen, navigation, theme). Gli schemi sono gli stessi del
 * frontend ({@code frontend/projects/schema/src/lib/schemas}, copiati nel jar dalla build): una sola fonte.
 *
 * <p>Le espressioni CEL non si controllano qui (lo fanno l'editor e il runtime, fail-closed): un'implementazione reale
 * può aggiungere il controllo con una libreria CEL lato server.
 */
@Component
public class SchemaValidation {

    /** Errori restituiti al massimo: oltre, il documento è da rivedere comunque. */
    static final int MAX_ISSUES = 20;

    private final ObjectMapper json = new ObjectMapper();
    private final Map<Kind, JsonSchema> schemas = new EnumMap<>(Kind.class);

    public SchemaValidation() {
        JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        SchemaValidatorsConfig config = SchemaValidatorsConfig.builder().locale(Locale.ITALIAN).build();
        for (Kind kind : Kind.values()) {
            try (InputStream in = getClass().getResourceAsStream("/schemas/" + kind.value() + ".schema.json")) {
                if (in == null) {
                    throw new IllegalStateException("Schema mancante nel classpath: " + kind.value());
                }
                schemas.put(kind, factory.getSchema(in, config));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    /** Problemi del documento rispetto allo schema del tipo, ordinati per posizione; vuoto se è valido. */
    public List<Issue> validate(Kind kind, String content) {
        JsonNode document;
        try {
            document = json.readTree(content);
        } catch (IOException e) {
            return List.of(new Issue("/", "Il contenuto non è JSON valido"));
        }
        return schemas.get(kind).validate(document).stream()
                .map(SchemaValidation::issue)
                .distinct()
                .sorted(Comparator.comparing(Issue::path))
                .limit(MAX_ISSUES)
                .toList();
    }

    private static Issue issue(ValidationMessage message) {
        String location = message.getInstanceLocation() == null ? "" : message.getInstanceLocation().toString();
        // Percorso in forma JSON Pointer, come nell'editor ($.components[0].type → /components/0/type).
        String path = location.replaceFirst("^\\$", "").replaceAll("\\[(\\d+)]", "/$1").replace('.', '/');
        // Il messaggio comincia con la posizione, già nel campo path.
        String text = message.getMessage();
        if (!location.isEmpty() && text.startsWith(location + ": ")) {
            text = text.substring(location.length() + 2);
        }
        return new Issue(path.isEmpty() ? "/" : path, text);
    }
}
