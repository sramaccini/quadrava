package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import it.lowcode.reference.registry.Model.Kind;
import it.lowcode.reference.registry.Model.ScreenReference;
import org.junit.jupiter.api.Test;

/** References by identifier to other screens, from the navigation and from screens. */
class ReferencesTest {

    @Test
    void theNavigationCitesTheScreensOfItsItemsEvenNested() {
        String navigation = """
                {"schemaVersion":"1.0","navigation":"principale","default":"invoices","areas":[
                  {"id":"invoices","label":"Fatture","items":[
                    {"id":"elenco","label":"Elenco","screen":"invoice-list"},
                    {"id":"nuova","label":"Nuova","children":[{"id":"sales","label":"Attiva","screen":"invoice-new"}]}]}]}""";
        assertThat(References.of(Kind.NAVIGATION, "principale", navigation)).containsExactly(
                new ScreenReference("invoice-list", "/areas/0/items/0/screen"),
                new ScreenReference("invoice-new", "/areas/0/items/1/children/0/screen"));
    }

    @Test
    void aScreenCitesNavigateStepsAndLinkNodesButNotItselfNorExpressions() {
        String screen = """
                {"schemaVersion":"1.0","screen":"order-list","components":[
                  {"type":"link","label":"Dettaglio","screen":"order-detail"},
                  {"type":"link","label":"Esterno","href":"https://example.org"},
                  {"type":"link","label":"Dinamico","screen":"{{ state.destinazione }}"},
                  {"type":"button","label":"Ricarica","onClick":[{"navigate":"order-list"}]}],
                 "actions":{"open":[{"navigate":"order-new","params":{"from":"list"}}]}}""";
        assertThat(References.of(Kind.SCREEN, "order-list", screen)).containsExactly(
                new ScreenReference("order-detail", "/components/0/screen"),
                new ScreenReference("order-new", "/actions/open/0/navigate"));
    }

    @Test
    void themesAndCataloguesHaveNoReferences() {
        assertThat(References.of(Kind.THEME, "light", "{\"schemaVersion\":\"1.0\",\"theme\":\"light\",\"screen\":\"x\"}")).isEmpty();
    }
}
