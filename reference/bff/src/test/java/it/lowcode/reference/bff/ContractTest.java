package it.lowcode.reference.bff;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.yaml.snakeyaml.Yaml;

/** The contract contracts/bff.yaml is readable and consistent, and the BFF exposes what it describes. */
class ContractTest {

    private static final Path CONTRACT = Path.of("..", "..", "contracts", "bff.yaml");

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
    void theEndpointsOfTheApplicationsAreInTheContract() throws IOException {
        Map<String, Object> paths = (Map<String, Object>) contract().get("paths");
        List<String> undocumented = new ArrayList<>();
        for (Class<?> controller : List.of(UserController.class, LoginController.class)) {
            for (Method method : controller.getDeclaredMethods()) {
                String verb = null;
                String[] path = null;
                if (method.getAnnotation(GetMapping.class) instanceof GetMapping get) {
                    verb = "get";
                    path = get.path().length > 0 ? get.path() : get.value();
                } else if (method.getAnnotation(PostMapping.class) instanceof PostMapping post) {
                    verb = "post";
                    path = post.path().length > 0 ? post.path() : post.value();
                }
                // The root only redirects people who open the BFF in the browser: not a call of the applications.
                if (verb == null || path[0].equals("/")) {
                    continue;
                }
                if (!(paths.get(path[0]) instanceof Map<?, ?> ops) || !ops.containsKey(verb)) {
                    undocumented.add(verb.toUpperCase() + " " + path[0]);
                }
            }
        }
        assertThat(undocumented).isEmpty();
        // The logout is Spring Security's, not a controller method.
        assertThat(paths).containsKey("/logout");
    }

    @Test
    @SuppressWarnings("unchecked")
    void theUserHasOnlyFieldsOfTheContract() throws IOException {
        Map<String, Object> schemas = (Map<String, Object>) ((Map<String, Object>) contract().get("components")).get("schemas");
        Map<String, Object> properties = (Map<String, Object>) ((Map<String, Object>) schemas.get("User")).get("properties");
        List<String> fields = Arrays.stream(UserController.UserInfo.class.getRecordComponents()).map(RecordComponent::getName).toList();
        assertThat(properties.keySet()).containsAll(fields);
    }
}
