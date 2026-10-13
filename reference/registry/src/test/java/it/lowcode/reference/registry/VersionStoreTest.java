package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import it.lowcode.reference.registry.Model.DocumentKey;
import it.lowcode.reference.registry.Model.Kind;
import org.junit.jupiter.api.Test;

class VersionStoreTest {

    private final VersionStore store = new VersionStore();
    private final DocumentKey elenco = new DocumentKey("ordini", Kind.SCREEN, "ordini-elenco");
    private final DocumentKey menu = new DocumentKey("ordini", Kind.NAVIGATION, "ordini");

    @Test
    void stessoContenutoStessaVersione() {
        var a = store.save(elenco, "{\"schemaVersion\":\"1.0\"}", "mario");
        var b = store.save(elenco, "{\"schemaVersion\":\"1.0\"}", "luisa");
        assertThat(a.hash()).isEqualTo(b.hash());
        assertThat(store.versions(elenco)).hasSize(1);
    }

    @Test
    void nonSiPubblicaUnaVersioneInesistente() {
        assertThat(store.publish(elenco, "produzione", "inesistente")).isFalse();
    }

    @Test
    void pubblicareFaPuntareUnAmbienteAUnaVersione() {
        var v1 = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":1}", "mario");
        var v2 = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":2}", "mario");
        assertThat(store.publish(elenco, "produzione", v1.hash())).isTrue();
        assertThat(store.publishedHash(elenco, "produzione")).contains(v1.hash());
        // Ripristino = ripubblicare una versione: la precedente resta disponibile.
        assertThat(store.publish(elenco, "produzione", v2.hash())).isTrue();
        assertThat(store.content(elenco, v1.hash())).isPresent();
    }

    @Test
    void documentiSeparatiConVersioniEPubblicazioniProprie() {
        var schermata = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"ordini-elenco\"}", "mario");
        store.save(menu, "{\"schemaVersion\":\"1.0\",\"navigation\":\"ordini\"}", "mario");
        assertThat(store.documents("ordini")).containsExactlyInAnyOrder(elenco, menu);
        // Una versione di un documento non si pubblica come versione di un altro.
        assertThat(store.publish(menu, "produzione", schermata.hash())).isFalse();
        assertThat(store.publish(elenco, "produzione", schermata.hash())).isTrue();
        assertThat(store.publishedEnvironments(elenco)).containsEntry("produzione", schermata.hash());
        assertThat(store.publishedEnvironments(menu)).isEmpty();
        assertThat(store.appIds()).containsExactly("ordini");
    }

    @Test
    void ilContenutoDeveAvereLIdentificativoDelPercorso() {
        assertThat(RegistryController.checkContent(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"ordini-elenco\"}")).isEmpty();
        assertThat(RegistryController.checkContent(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"altro\"}")).isPresent();
        assertThat(RegistryController.checkContent(menu, "{\"navigation\":\"ordini\"}")).isPresent();
        assertThat(RegistryController.checkContent(menu, "[1, 2]")).isPresent();
    }
}
