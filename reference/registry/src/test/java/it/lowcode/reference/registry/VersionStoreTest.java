package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import it.lowcode.reference.registry.Model.DocumentKey;
import it.lowcode.reference.registry.Model.Kind;
import it.lowcode.reference.registry.VersionStore.ReviewOutcome;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

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
        assertThat(store.publish(elenco, "production", "inesistente")).isFalse();
    }

    @Test
    void pubblicareFaPuntareUnAmbienteAUnaVersione() {
        var v1 = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":1}", "mario");
        var v2 = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":2}", "mario");
        assertThat(store.publish(elenco, "production", v1.hash())).isTrue();
        assertThat(store.publishedHash(elenco, "production")).contains(v1.hash());
        // Ripristino = ripubblicare una versione: la precedente resta disponibile.
        assertThat(store.publish(elenco, "production", v2.hash())).isTrue();
        assertThat(store.content(elenco, v1.hash())).isPresent();
        assertThat(store.latest(elenco)).contains(v2);
    }

    @Test
    void documentiSeparatiConVersioniEPubblicazioniProprie() {
        var schermata = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"ordini-elenco\"}", "mario");
        store.save(menu, "{\"schemaVersion\":\"1.0\",\"navigation\":\"ordini\"}", "mario");
        assertThat(store.documents("ordini")).containsExactlyInAnyOrder(elenco, menu);
        // Una versione di un documento non si pubblica come versione di un altro.
        assertThat(store.publish(menu, "production", schermata.hash())).isFalse();
        assertThat(store.publish(elenco, "production", schermata.hash())).isTrue();
        assertThat(store.publishedEnvironments(elenco)).containsEntry("production", schermata.hash());
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

    @Test
    void revisioneDaBozzaAdApprovataORespinta() {
        var v = store.save(elenco, "{\"schemaVersion\":\"1.0\"}", "mario");
        assertThat(v.state()).isEqualTo("draft");
        // Non si approva una bozza: prima si chiede la revisione.
        assertThat(store.review(elenco, v.hash(), "approve", "luisa", null)).isInstanceOf(ReviewOutcome.NotAllowed.class);
        assertThat(store.review(elenco, v.hash(), "request", "mario", null)).isInstanceOf(ReviewOutcome.Done.class);
        var respinta = (ReviewOutcome.Done) store.review(elenco, v.hash(), "reject", "luisa", "Manca il filtro per stato");
        assertThat(respinta.version().state()).isEqualTo("rejected");
        assertThat(respinta.version().reviewedBy()).isEqualTo("luisa");
        assertThat(respinta.version().reviewNote()).isEqualTo("Manca il filtro per stato");
        // Respinta, si può chiedere di nuovo; poi approvare.
        store.review(elenco, v.hash(), "request", "mario", null);
        var approvata = (ReviewOutcome.Done) store.review(elenco, v.hash(), "approve", "luisa", null);
        assertThat(approvata.version().state()).isEqualTo("approved");
        assertThat(approvata.version().hash()).isEqualTo(v.hash());
        assertThat(store.review(elenco, "inesistente", "request", "mario", null)).isInstanceOf(ReviewOutcome.NotFound.class);
    }

    @Test
    void archivioSuFileSopravviveAlRiavvio(@TempDir Path dir) throws Exception {
        var first = new VersionStore(dir);
        var v1 = first.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":1}", "mario");
        var v2 = first.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":2}", "mario");
        first.review(elenco, v1.hash(), "request", "mario", null);
        first.review(elenco, v1.hash(), "approve", "luisa", "ok");
        first.publish(elenco, "production", v1.hash());
        first.save(menu, "{\"schemaVersion\":\"1.0\",\"navigation\":\"ordini\"}", "mario");
        assertThat(Files.exists(dir.resolve("ordini/screen/ordini-elenco/index.json"))).isTrue();
        assertThat(Files.exists(dir.resolve("ordini/screen/ordini-elenco/" + v1.hash() + ".json"))).isTrue();

        var second = new VersionStore(dir);
        assertThat(second.documents("ordini")).containsExactlyInAnyOrder(elenco, menu);
        assertThat(second.versions(elenco)).extracting(Model.DocumentVersion::hash).containsExactly(v2.hash(), v1.hash());
        assertThat(second.version(elenco, v1.hash()).orElseThrow().state()).isEqualTo("approved");
        assertThat(second.version(elenco, v1.hash()).orElseThrow().reviewedBy()).isEqualTo("luisa");
        assertThat(second.publishedHash(elenco, "production")).contains(v1.hash());
        assertThat(second.content(elenco, v2.hash())).contains("{\"schemaVersion\":\"1.0\",\"n\":2}");
    }

    @Test
    void identificativiNonValidiNonDiventanoPercorsi(@TempDir Path dir) {
        var onDisk = new VersionStore(dir);
        assertThatThrownBy(() -> onDisk.save(new DocumentKey("..", Kind.SCREEN, "x"), "{}", "mario")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> onDisk.save(new DocumentKey("app", Kind.SCREEN, "../fuori"), "{}", "mario")).isInstanceOf(IllegalArgumentException.class);
    }
}
