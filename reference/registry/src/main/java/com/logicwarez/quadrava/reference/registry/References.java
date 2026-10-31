package com.logicwarez.quadrava.reference.registry;

import com.logicwarez.quadrava.reference.registry.Model.DataSourcesReference;
import com.logicwarez.quadrava.reference.registry.Model.Kind;
import com.logicwarez.quadrava.reference.registry.Model.ScreenReference;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.json.JsonParserFactory;

/**
 * References by identifier from a document to other screens: {@code screen} of the navigation items, {@code navigate}
 * steps and {@code link} nodes with {@code screen} in screens. A reference of a screen to itself does not count, nor
 * does a value with an expression ({@code {{ }}}): it is known only when the screen is open.
 */
public final class References {
    private References() {}

    /** References of the content (already validated), in document order, with the position as a JSON Pointer. */
    public static List<ScreenReference> of(Kind kind, String documentId, String content) {
        if (kind != Kind.SCREEN && kind != Kind.NAVIGATION) {
            return List.of();
        }
        List<ScreenReference> found = new ArrayList<>();
        visit(kind, JsonParserFactory.getJsonParser().parseMap(content), "", true, found);
        return found.stream().filter(r -> !(kind == Kind.SCREEN && r.screen().equals(documentId))).toList();
    }

    private static void visit(Kind kind, Object node, String path, boolean root, List<ScreenReference> found) {
        if (node instanceof Map<?, ?> map) {
            if (kind == Kind.NAVIGATION && !root) {
                add(map.get("screen"), path + "/screen", found);
            }
            if (kind == Kind.SCREEN) {
                add(map.get("navigate"), path + "/navigate", found);
                if ("link".equals(map.get("type"))) {
                    add(map.get("screen"), path + "/screen", found);
                }
            }
            map.forEach((key, value) -> visit(kind, value, path + "/" + escape(String.valueOf(key)), false, found));
        } else if (node instanceof List<?> list) {
            for (int i = 0; i < list.size(); i++) {
                visit(kind, list.get(i), path + "/" + i, false, found);
            }
        }
    }

    private static void add(Object value, String path, List<ScreenReference> found) {
        if (value instanceof String screen && !screen.isBlank() && !screen.contains("{{")) {
            found.add(new ScreenReference(screen, path));
        }
    }

    /**
     * References of a screen (already validated) to the data sources documents: {@code ref} of its {@code dataSources}
     * entries ({@code orders/list} refers to the document {@code orders}), in document order.
     */
    public static List<DataSourcesReference> dataSourcesOf(Kind kind, String content) {
        if (kind != Kind.SCREEN) {
            return List.of();
        }
        List<DataSourcesReference> found = new ArrayList<>();
        if (JsonParserFactory.getJsonParser().parseMap(content).get("dataSources") instanceof Map<?, ?> sources) {
            sources.forEach((name, entry) -> {
                if (entry instanceof Map<?, ?> map && map.get("ref") instanceof String ref && ref.contains("/")) {
                    found.add(new DataSourcesReference(ref.substring(0, ref.indexOf('/')), "/dataSources/" + escape(String.valueOf(name)) + "/ref"));
                }
            });
        }
        return found;
    }

    private static String escape(String key) {
        return key.replace("~", "~0").replace("/", "~1");
    }
}
