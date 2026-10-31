package com.logicwarez.quadrava.reference.registry;

import com.logicwarez.quadrava.reference.registry.Model.DocumentKey;
import com.logicwarez.quadrava.reference.registry.Model.DocumentVersion;
import com.logicwarez.quadrava.reference.registry.Model.Kind;
import com.logicwarez.quadrava.reference.registry.Model.State;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

/**
 * Version store. Every document (a screen, the navigation, a theme) has its own immutable versions, identified by the
 * hash of the content, and its own publications: publishing means pointing an environment at a version.
 *
 * <p>Without a folder everything stays in memory. With a folder ({@code quadrava.registry.storage-dir}) every document
 * has its own: {@code <app>/<kind>/<document>/index.json} with versions and publications, and a {@code <hash>.json}
 * file for every content; files are written atomically (temporary file, then rename). Identifiers are checked
 * ({@link Model#IDENTIFIER}) before they become paths.
 */
public class VersionStore {

    private static final Logger log = LoggerFactory.getLogger(VersionStore.class);

    /** Content of {@code index.json}: versions from the oldest, and environment → published hash. */
    record Index(List<DocumentVersion> versions, Map<String, String> published) {}

    private record Entry(List<DocumentVersion> versions, Map<String, String> contents, Map<String, String> published) {
        Entry() {
            this(new ArrayList<>(), new LinkedHashMap<>(), new LinkedHashMap<>());
        }
    }

    /** Outcome of a review state change. */
    public sealed interface ReviewOutcome {
        record Done(DocumentVersion version) implements ReviewOutcome {}

        record NotFound() implements ReviewOutcome {}

        record NotAllowed(String reason) implements ReviewOutcome {}
    }

    private final Map<DocumentKey, Entry> documents = new ConcurrentHashMap<>();
    private final Path dir;
    private final JsonMapper json = JsonMapper.builder().build();

    /** In-memory store. */
    public VersionStore() {
        this(null);
    }

    /** File store in the given folder (created if missing); {@code null} = in memory. */
    public VersionStore(Path dir) {
        this.dir = dir;
        if (dir != null) {
            load();
        }
    }

    public synchronized DocumentVersion save(DocumentKey key, String content, String author) {
        if (dir != null) {
            folder(key);
        }
        String hash = sha256(content);
        Entry entry = documents.computeIfAbsent(key, k -> new Entry());
        Optional<DocumentVersion> existing = entry.versions().stream().filter(v -> v.hash().equals(hash)).findFirst();
        if (existing.isPresent()) {
            return existing.get();
        }
        DocumentVersion version = new DocumentVersion(hash, Instant.now(), author, State.DRAFT.value());
        entry.versions().add(version);
        entry.contents().put(hash, content);
        persist(key, entry, hash);
        return version;
    }

    /** Latest saved version. */
    public synchronized Optional<DocumentVersion> latest(DocumentKey key) {
        Entry entry = documents.get(key);
        return entry == null || entry.versions().isEmpty() ? Optional.empty() : Optional.of(entry.versions().getLast());
    }

    /** Versions of a document, newest first. */
    public synchronized List<DocumentVersion> versions(DocumentKey key) {
        Entry entry = documents.get(key);
        return entry == null ? List.of() : List.copyOf(entry.versions().reversed());
    }

    public synchronized Optional<DocumentVersion> version(DocumentKey key, String hash) {
        Entry entry = documents.get(key);
        return entry == null ? Optional.empty() : entry.versions().stream().filter(v -> v.hash().equals(hash)).findFirst();
    }

    public synchronized Optional<String> content(DocumentKey key, String hash) {
        Entry entry = documents.get(key);
        return entry == null ? Optional.empty() : Optional.ofNullable(entry.contents().get(hash));
    }

    /**
     * Changes the review state of a version: {@code request} from draft or rejected to in review; {@code approve} and
     * {@code reject} from in review. Checks on who may do it are up to the caller.
     */
    public synchronized ReviewOutcome review(DocumentKey key, String hash, String action, String reviewer, String note) {
        Entry entry = documents.get(key);
        if (entry == null) {
            return new ReviewOutcome.NotFound();
        }
        for (int i = 0; i < entry.versions().size(); i++) {
            DocumentVersion version = entry.versions().get(i);
            if (!version.hash().equals(hash)) {
                continue;
            }
            String state = version.state();
            State next = switch (action) {
                case "request" -> state.equals(State.DRAFT.value()) || state.equals(State.REJECTED.value()) ? State.IN_REVIEW : null;
                case "approve" -> state.equals(State.IN_REVIEW.value()) ? State.APPROVED : null;
                case "reject" -> state.equals(State.IN_REVIEW.value()) ? State.REJECTED : null;
                default -> null;
            };
            if (next == null) {
                return new ReviewOutcome.NotAllowed("Action «" + action + "» not allowed for a version in state «" + state + "»");
            }
            DocumentVersion updated = version.withReview(next, reviewer, note);
            entry.versions().set(i, updated);
            persist(key, entry, null);
            return new ReviewOutcome.Done(updated);
        }
        return new ReviewOutcome.NotFound();
    }

    /** Points an environment at an existing version of the document; false if the version does not exist. */
    public synchronized boolean publish(DocumentKey key, String env, String hash) {
        Entry entry = documents.get(key);
        if (entry == null || !entry.contents().containsKey(hash)) {
            return false;
        }
        entry.published().put(env, hash);
        persist(key, entry, null);
        return true;
    }

    public synchronized Optional<String> publishedHash(DocumentKey key, String env) {
        Entry entry = documents.get(key);
        return entry == null ? Optional.empty() : Optional.ofNullable(entry.published().get(env));
    }

    /** Environment → published hash. */
    public synchronized Map<String, String> publishedEnvironments(DocumentKey key) {
        Entry entry = documents.get(key);
        return entry == null ? Map.of() : Map.copyOf(entry.published());
    }

    /** Documents of an application. */
    public synchronized List<DocumentKey> documents(String appId) {
        return documents.keySet().stream().filter(k -> k.appId().equals(appId)).toList();
    }

    public synchronized List<String> appIds() {
        return documents.keySet().stream().map(DocumentKey::appId).distinct().sorted().toList();
    }

    // --- file store ---

    private Path folder(DocumentKey key) {
        // Identifiers already checked by the controller; checked again here, because they become paths.
        if (!Model.IDENTIFIER.matcher(key.appId()).matches() || !Model.IDENTIFIER.matcher(key.documentId()).matches()) {
            throw new IllegalArgumentException("Invalid identifier");
        }
        return dir.resolve(key.appId()).resolve(key.kind().value()).resolve(key.documentId());
    }

    private void persist(DocumentKey key, Entry entry, String newHash) {
        if (dir == null) {
            return;
        }
        Path folder = folder(key);
        try {
            Files.createDirectories(folder);
            if (newHash != null) {
                write(folder.resolve(newHash + ".json"), entry.contents().get(newHash));
            }
            write(folder.resolve("index.json"), json.writeValueAsString(new Index(entry.versions(), entry.published())));
        } catch (IOException e) {
            throw new UncheckedIOException("Registry store not writable", e);
        }
    }

    private static void write(Path target, String text) throws IOException {
        Path temp = target.resolveSibling(target.getFileName() + ".tmp");
        Files.writeString(temp, text, StandardCharsets.UTF_8);
        Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private void load() {
        try {
            Files.createDirectories(dir);
            try (Stream<Path> indexes = Files.find(dir, 4, (p, a) -> p.getFileName().toString().equals("index.json"))) {
                for (Path index : indexes.toList()) {
                    loadDocument(index);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Registry store not readable", e);
        }
        log.info("Registry stored on file in {}: {} documents", dir.toAbsolutePath(), documents.size());
    }

    private void loadDocument(Path index) throws IOException {
        Path folder = index.getParent();
        Path rel = dir.relativize(folder);
        if (rel.getNameCount() != 3) {
            return;
        }
        Optional<Kind> kind = Kind.parse(rel.getName(1).toString());
        String appId = rel.getName(0).toString();
        String documentId = rel.getName(2).toString();
        if (kind.isEmpty() || !Model.IDENTIFIER.matcher(appId).matches() || !Model.IDENTIFIER.matcher(documentId).matches()) {
            log.warn("Folder ignored in the registry store: {}", rel);
            return;
        }
        Index data = json.readValue(Files.readString(index, StandardCharsets.UTF_8), Index.class);
        Entry entry = new Entry();
        for (DocumentVersion version : data.versions()) {
            Path file = folder.resolve(version.hash() + ".json");
            if (!version.hash().matches("[0-9a-f]{64}") || !Files.exists(file)) {
                log.warn("Version without content ignored: {} {}", rel, version.hash());
                continue;
            }
            entry.versions().add(version);
            entry.contents().put(version.hash(), Files.readString(file, StandardCharsets.UTF_8));
        }
        data.published().forEach((env, hash) -> {
            if (entry.contents().containsKey(hash)) {
                entry.published().put(env, hash);
            }
        });
        documents.put(new DocumentKey(appId, kind.get(), documentId), entry);
    }

    static String sha256(String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
