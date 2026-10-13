package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import it.lowcode.reference.registry.Model.Issue;
import it.lowcode.reference.registry.Model.Kind;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/** Il validatore del registro e quello del frontend (Ajv) devono dare lo stesso giudizio sugli stessi documenti. */
class SchemaValidationTest {

    private final SchemaValidation validation = new SchemaValidation();
    private static final Path EXAMPLES = Path.of("..", "..", "examples");

    @Test
    void tuttiGliEsempiSonoValidiAncheNelRegistro() throws IOException {
        int checked = 0;
        try (Stream<Path> files = Stream.concat(Files.list(EXAMPLES), Files.list(EXAMPLES.resolve("themes")))) {
            for (Path file : files.filter(f -> f.toString().endsWith(".json") && !f.getFileName().toString().equals("index.json")).toList()) {
                String content = Files.readString(file, StandardCharsets.UTF_8);
                Kind kind = file.getFileName().toString().equals("navigation.json") ? Kind.NAVIGATION
                        : file.getParent().getFileName().toString().equals("themes") ? Kind.THEME : Kind.SCREEN;
                assertThat(validation.validate(kind, content)).as(file.toString()).isEmpty();
                checked++;
            }
        }
        assertThat(checked).isGreaterThan(20);
    }

    @Test
    void segnalaPosizioneEMotivo() {
        List<Issue> issues = validation.validate(Kind.SCREEN, """
                {"schemaVersion":"1.0","screen":"x","components":[{"type":"grid","columns":13,"components":[]}]}""");
        assertThat(issues).isNotEmpty();
        assertThat(issues).anySatisfy(i -> assertThat(i.path()).isEqualTo("/components/0/columns"));
        assertThat(validation.validate(Kind.THEME, "non json")).extracting(Issue::path).containsExactly("/");
    }
}
