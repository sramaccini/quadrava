package com.logicwarez.quadrava.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.yaml.snakeyaml.Yaml;

/** The contract contracts/registry.yaml is readable and consistent, and the implementation exposes only what it describes. */
class ContractTest {

    private static final Path CONTRACT = Path.of("..", "..", "contracts", "registry.yaml");

    @SuppressWarnings("unchecked")
    private static Map<String, Object> contract() throws IOException {
        return new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
    }

    @Test
    void everyReferencePointsToSomethingThatExists() throws IOException {
        Map<String, Object> doc = contract();
        assertThat(doc.get("openapi")).isEqualTo("3.1.0");
        String text = Files.readString(CONTRACT, StandardCharsets.UTF_8);
        Matcher refs = Pattern.compile("\\$ref: '#/([^']+)'").matcher(text);
        List<String> missing = new ArrayList<>();
        while (refs.find()) {
            Object node = doc;
            for (String part : refs.group(1).split("/")) {
                node = node instanceof Map<?, ?> map ? map.get(part) : null;
            }
            if (node == null) {
                missing.add(refs.group(1));
            }
        }
        assertThat(missing).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void everyControllerOperationIsDescribedInTheContract() throws IOException {
        Map<String, Object> paths = (Map<String, Object>) contract().get("paths");
        List<String> undocumented = new ArrayList<>();
        for (Method method : RegistryController.class.getDeclaredMethods()) {
            String verb = null;
            String[] path = null;
            if (method.getAnnotation(GetMapping.class) instanceof GetMapping get) {
                verb = "get";
                path = get.path().length > 0 ? get.path() : get.value();
            } else if (method.getAnnotation(PostMapping.class) instanceof PostMapping post) {
                verb = "post";
                path = post.path().length > 0 ? post.path() : post.value();
            } else if (method.getAnnotation(PutMapping.class) instanceof PutMapping put) {
                verb = "put";
                path = put.path().length > 0 ? put.path() : put.value();
            }
            if (verb == null) {
                continue;
            }
            Object operations = paths.get(path[0]);
            if (!(operations instanceof Map<?, ?> ops) || !ops.containsKey(verb.toLowerCase(Locale.ROOT))) {
                undocumented.add(verb.toUpperCase(Locale.ROOT) + " " + path[0]);
            }
        }
        assertThat(undocumented).isEmpty();
    }
}
