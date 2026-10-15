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
    void sameContentSameVersion() {
        var a = store.save(elenco, "{\"schemaVersion\":\"1.0\"}", "mario");
        var b = store.save(elenco, "{\"schemaVersion\":\"1.0\"}", "luisa");
        assertThat(a.hash()).isEqualTo(b.hash());
        assertThat(store.versions(elenco)).hasSize(1);
    }

    @Test
    void aMissingVersionIsNotPublished() {
        assertThat(store.publish(elenco, "production", "missing")).isFalse();
    }

    @Test
    void publishingPointsAnEnvironmentAtAVersion() {
        var v1 = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":1}", "mario");
        var v2 = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"n\":2}", "mario");
        assertThat(store.publish(elenco, "production", v1.hash())).isTrue();
        assertThat(store.publishedHash(elenco, "production")).contains(v1.hash());
        // Rollback = publishing a version again: the previous one stays available.
        assertThat(store.publish(elenco, "production", v2.hash())).isTrue();
        assertThat(store.content(elenco, v1.hash())).isPresent();
        assertThat(store.latest(elenco)).contains(v2);
    }

    @Test
    void separateDocumentsWithTheirOwnVersionsAndPublications() {
        var screen = store.save(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"ordini-elenco\"}", "mario");
        store.save(menu, "{\"schemaVersion\":\"1.0\",\"navigation\":\"ordini\"}", "mario");
        assertThat(store.documents("ordini")).containsExactlyInAnyOrder(elenco, menu);
        // A version of one document is not published as a version of another.
        assertThat(store.publish(menu, "production", screen.hash())).isFalse();
        assertThat(store.publish(elenco, "production", screen.hash())).isTrue();
        assertThat(store.publishedEnvironments(elenco)).containsEntry("production", screen.hash());
        assertThat(store.publishedEnvironments(menu)).isEmpty();
        assertThat(store.appIds()).containsExactly("ordini");
    }

    @Test
    void theContentMustHaveTheIdentifierOfThePath() {
        assertThat(RegistryController.checkContent(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"ordini-elenco\"}")).isEmpty();
        assertThat(RegistryController.checkContent(elenco, "{\"schemaVersion\":\"1.0\",\"screen\":\"other\"}")).isPresent();
        assertThat(RegistryController.checkContent(menu, "{\"navigation\":\"ordini\"}")).isPresent();
        assertThat(RegistryController.checkContent(menu, "[1, 2]")).isPresent();
    }

    @Test
    void reviewFromDraftToApprovedOrRejected() {
        var v = store.save(elenco, "{\"schemaVersion\":\"1.0\"}", "mario");
        assertThat(v.state()).isEqualTo("draft");
        // A draft is not approved: first the review is requested.
        assertThat(store.review(elenco, v.hash(), "approve", "luisa", null)).isInstanceOf(ReviewOutcome.NotAllowed.class);
        assertThat(store.review(elenco, v.hash(), "request", "mario", null)).isInstanceOf(ReviewOutcome.Done.class);
        var rejected = (ReviewOutcome.Done) store.review(elenco, v.hash(), "reject", "luisa", "The status filter is missing");
        assertThat(rejected.version().state()).isEqualTo("rejected");
        assertThat(rejected.version().reviewedBy()).isEqualTo("luisa");
        assertThat(rejected.version().reviewNote()).isEqualTo("The status filter is missing");
        // Once rejected, the review can be requested again; then approved.
        store.review(elenco, v.hash(), "request", "mario", null);
        var approved = (ReviewOutcome.Done) store.review(elenco, v.hash(), "approve", "luisa", null);
        assertThat(approved.version().state()).isEqualTo("approved");
        assertThat(approved.version().hash()).isEqualTo(v.hash());
        assertThat(store.review(elenco, "missing", "request", "mario", null)).isInstanceOf(ReviewOutcome.NotFound.class);
    }

    @Test
    void theFileStoreSurvivesARestart(@TempDir Path dir) throws Exception {
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
    void invalidIdentifiersDoNotBecomePaths(@TempDir Path dir) {
        var onDisk = new VersionStore(dir);
        assertThatThrownBy(() -> onDisk.save(new DocumentKey("..", Kind.SCREEN, "x"), "{}", "mario")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> onDisk.save(new DocumentKey("app", Kind.SCREEN, "../outside"), "{}", "mario")).isInstanceOf(IllegalArgumentException.class);
    }
}
