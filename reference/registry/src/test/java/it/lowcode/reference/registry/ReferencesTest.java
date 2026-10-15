package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import it.lowcode.reference.registry.Model.Kind;
import it.lowcode.reference.registry.Model.ScreenReference;
import org.junit.jupiter.api.Test;

/** Riferimenti per identificativo verso altre schermate, dalla navigazione e dalle schermate. */
class ReferencesTest {

    @Test
    void laNavigazioneCitaLeSchermateDelleVociAncheAnnidate() {
        String navigation = """
                {"schemaVersion":"1.0","navigation":"principale","default":"fatture","useCases":[
                  {"id":"fatture","label":"Fatture","items":[
                    {"id":"elenco","label":"Elenco","screen":"fatture-elenco"},
                    {"id":"nuova","label":"Nuova","children":[{"id":"attiva","label":"Attiva","screen":"fattura-nuova"}]}]}]}""";
        assertThat(References.of(Kind.NAVIGATION, "principale", navigation)).containsExactly(
                new ScreenReference("fatture-elenco", "/useCases/0/items/0/screen"),
                new ScreenReference("fattura-nuova", "/useCases/0/items/1/children/0/screen"));
    }

    @Test
    void laSchermataCitaPassiNavigateENodiLinkMaNonSeStessaNeLeEspressioni() {
        String screen = """
                {"schemaVersion":"1.0","screen":"ordini-elenco","components":[
                  {"type":"link","label":"Dettaglio","screen":"ordine-dettaglio"},
                  {"type":"link","label":"Esterno","href":"https://example.org"},
                  {"type":"link","label":"Dinamico","screen":"{{ state.destinazione }}"},
                  {"type":"button","label":"Ricarica","onClick":[{"navigate":"ordini-elenco"}]}],
                 "actions":{"apri":[{"navigate":"ordine-nuovo","params":{"da":"elenco"}}]}}""";
        assertThat(References.of(Kind.SCREEN, "ordini-elenco", screen)).containsExactly(
                new ScreenReference("ordine-dettaglio", "/components/0/screen"),
                new ScreenReference("ordine-nuovo", "/actions/apri/0/navigate"));
    }

    @Test
    void temiECataloghiNonHannoRiferimenti() {
        assertThat(References.of(Kind.THEME, "chiaro", "{\"schemaVersion\":\"1.0\",\"theme\":\"chiaro\",\"screen\":\"x\"}")).isEmpty();
    }
}
