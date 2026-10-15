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
 * Validates the documents against the schema of their kind (screen, navigation, theme, messages). The schemas are the
 * same as the front end's ({@code frontend/projects/schema/src/lib/schemas}, copied into the jar by the build): one source.
 *
 * <p>CEL expressions are not checked here (the editor and the runtime do it, fail-closed): a real implementation can add
 * the check with a server-side CEL library.
 */
@Component
public class SchemaValidation {

    /** Maximum number of errors returned: beyond that the document needs reworking anyway. */
    static final int MAX_ISSUES = 20;

    private final ObjectMapper json = new ObjectMapper();
    private final Map<Kind, JsonSchema> schemas = new EnumMap<>(Kind.class);

    public SchemaValidation() {
        JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        SchemaValidatorsConfig config = SchemaValidatorsConfig.builder().locale(Locale.ENGLISH).build();
        for (Kind kind : Kind.values()) {
            try (InputStream in = getClass().getResourceAsStream("/schemas/" + kind.value() + ".schema.json")) {
                if (in == null) {
                    throw new IllegalStateException("Schema missing from the classpath: " + kind.value());
                }
                schemas.put(kind, factory.getSchema(in, config));
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    /** Problems of the document against the schema of its kind, sorted by position; empty if it is valid. */
    public List<Issue> validate(Kind kind, String content) {
        JsonNode document;
        try {
            document = json.readTree(content);
        } catch (IOException e) {
            return List.of(new Issue("/", "The content is not valid JSON"));
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
        // Path as a JSON Pointer, as in the editor ($.components[0].type → /components/0/type).
        String path = location.replaceFirst("^\\$", "").replaceAll("\\[(\\d+)]", "/$1").replace('.', '/');
        // The message starts with the position, already in the path field.
        String text = message.getMessage();
        if (!location.isEmpty() && text.startsWith(location + ": ")) {
            text = text.substring(location.length() + 2);
        }
        return new Issue(path.isEmpty() ? "/" : path, text);
    }
}
