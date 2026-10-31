package com.logicwarez.quadrava.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import com.logicwarez.quadrava.reference.registry.Model.Issue;
import com.logicwarez.quadrava.reference.registry.Model.Kind;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/** The registry validator and the front-end one (Ajv) must give the same verdict on the same documents. */
class SchemaValidationTest {

    private final SchemaValidation validation = new SchemaValidation();
    private static final Path EXAMPLES = Path.of("..", "..", "examples");

    @Test
    void everyExampleIsValidInTheRegistryToo() throws IOException {
        int checked = 0;
        // The example project: screens/, themes/ and navigation.json.
        try (Stream<Path> files = Stream.concat(
                Stream.concat(Files.list(EXAMPLES.resolve("screens")), Files.list(EXAMPLES.resolve("themes"))),
                Stream.of(EXAMPLES.resolve("navigation.json")))) {
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
    void theExampleDataSourcesAreValidInTheRegistryToo() throws IOException {
        try (Stream<Path> files = Files.list(EXAMPLES.resolve("datasources"))) {
            List<Path> documents = files.filter(f -> f.toString().endsWith(".json")).toList();
            assertThat(documents).isNotEmpty();
            for (Path file : documents) {
                assertThat(validation.validate(Kind.DATASOURCES, Files.readString(file, StandardCharsets.UTF_8))).as(file.toString()).isEmpty();
            }
        }
        // The data sources use the definition of the screen schema: an incomplete one is rejected.
        assertThat(validation.validate(Kind.DATASOURCES, """
                {"schemaVersion":"1.0","datasources":"x","sources":{"list":{"url":"/api"}}}""")).isNotEmpty();
    }

    @Test
    void theExampleCataloguesAreValidMessagesDocuments() throws IOException {
        for (String locale : List.of("it", "en")) {
            String texts = Files.readString(EXAMPLES.resolve("i18n").resolve(locale + ".json"), StandardCharsets.UTF_8);
            String document = "{\"schemaVersion\":\"1.0\",\"messages\":\"" + locale + "\",\"texts\":" + texts + "}";
            assertThat(validation.validate(Kind.MESSAGES, document)).as(locale).isEmpty();
        }
        assertThat(validation.validate(Kind.MESSAGES, "{\"schemaVersion\":\"1.0\",\"messages\":\"it\",\"texts\":{\"a b\":\"x\"}}")).isNotEmpty();
    }

    @Test
    void reportsPositionAndReason() {
        List<Issue> issues = validation.validate(Kind.SCREEN, """
                {"schemaVersion":"1.0","screen":"x","components":[{"type":"grid","columns":13,"components":[]}]}""");
        assertThat(issues).isNotEmpty();
        assertThat(issues).anySatisfy(i -> assertThat(i.path()).isEqualTo("/components/0/columns"));
        assertThat(validation.validate(Kind.THEME, "not json")).extracting(Issue::path).containsExactly("/");
    }
}
