package it.lowcode.reference.registry;

import it.lowcode.reference.registry.Model.Kind;
import it.lowcode.reference.registry.Model.ScreenReference;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.boot.json.JsonParserFactory;

/**
 * Riferimenti per identificativo da un documento ad altre schermate: {@code screen} delle voci della navigazione,
 * passi {@code navigate} e nodi {@code link} con {@code screen} delle schermate. Un riferimento della schermata a se
 * stessa non conta, né un valore con un'espressione ({@code {{ }}}): si sa solo quando la schermata è aperta.
 */
public final class References {
    private References() {}

    /** Riferimenti del contenuto (già validato), nell'ordine del documento, con la posizione in JSON Pointer. */
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

    private static String escape(String key) {
        return key.replace("~", "~0").replace("/", "~1");
    }
}
