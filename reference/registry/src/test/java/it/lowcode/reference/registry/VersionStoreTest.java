package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VersionStoreTest {

    private final VersionStore store = new VersionStore();

    @Test
    void stessoContenutoStessaVersione() {
        var a = store.save("ordini", "{\"schemaVersion\":\"1.0\"}", "mario");
        var b = store.save("ordini", "{\"schemaVersion\":\"1.0\"}", "luisa");
        assertThat(a.hash()).isEqualTo(b.hash());
        assertThat(store.versions("ordini")).hasSize(1);
    }

    @Test
    void nonSiPubblicaUnaVersioneInesistente() {
        assertThat(store.publish("ordini", "produzione", "inesistente")).isFalse();
    }

    @Test
    void pubblicareFaPuntareUnAmbienteAUnaVersione() {
        var v1 = store.save("ordini", "{\"schemaVersion\":\"1.0\",\"n\":1}", "mario");
        var v2 = store.save("ordini", "{\"schemaVersion\":\"1.0\",\"n\":2}", "mario");
        assertThat(store.publish("ordini", "produzione", v1.hash())).isTrue();
        assertThat(store.publishedHash("ordini", "produzione")).contains(v1.hash());
        // Ripristino = ripubblicare una versione: la precedente resta disponibile.
        assertThat(store.publish("ordini", "produzione", v2.hash())).isTrue();
        assertThat(store.content("ordini", v1.hash())).isPresent();
    }
}
