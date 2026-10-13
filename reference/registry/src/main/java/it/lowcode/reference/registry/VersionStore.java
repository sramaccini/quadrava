package it.lowcode.reference.registry;

import it.lowcode.reference.registry.Model.DocumentKey;
import it.lowcode.reference.registry.Model.DocumentVersion;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;

/**
 * Archivio in memoria. Ogni documento (una schermata, la navigazione, un tema) ha le proprie versioni immutabili,
 * identificate dall'hash del contenuto, e le proprie pubblicazioni: pubblicare è far puntare un ambiente a una versione.
 */
@Component
public class VersionStore {

    private record Stored(DocumentVersion version, String content) {}

    private final Map<DocumentKey, List<Stored>> versions = new ConcurrentHashMap<>();
    private final Map<DocumentKey, Map<String, String>> published = new ConcurrentHashMap<>();

    public DocumentVersion save(DocumentKey key, String content, String author) {
        String hash = sha256(content);
        List<Stored> list = versions.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>());
        return list.stream()
                .filter(s -> s.version().hash().equals(hash))
                .findFirst()
                .map(Stored::version)
                .orElseGet(() -> {
                    DocumentVersion version = new DocumentVersion(hash, Instant.now(), author, "bozza");
                    list.add(new Stored(version, content));
                    return version;
                });
    }

    /** Versioni di un documento, dalla più recente. */
    public List<DocumentVersion> versions(DocumentKey key) {
        List<DocumentVersion> result = new ArrayList<>();
        versions.getOrDefault(key, List.of()).forEach(s -> result.add(s.version()));
        return result.reversed();
    }

    public Optional<String> content(DocumentKey key, String hash) {
        return versions.getOrDefault(key, List.of()).stream()
                .filter(s -> s.version().hash().equals(hash))
                .map(Stored::content)
                .findFirst();
    }

    /** Fa puntare un ambiente a una versione esistente del documento; false se la versione non esiste. */
    public boolean publish(DocumentKey key, String env, String hash) {
        if (content(key, hash).isEmpty()) {
            return false;
        }
        published.computeIfAbsent(key, k -> new ConcurrentHashMap<>()).put(env, hash);
        return true;
    }

    public Optional<String> publishedHash(DocumentKey key, String env) {
        return Optional.ofNullable(published.getOrDefault(key, Map.of()).get(env));
    }

    /** Ambiente → hash pubblicato. */
    public Map<String, String> publishedEnvironments(DocumentKey key) {
        return Map.copyOf(published.getOrDefault(key, Map.of()));
    }

    /** Documenti di un'applicazione. */
    public List<DocumentKey> documents(String appId) {
        return versions.keySet().stream().filter(k -> k.appId().equals(appId)).toList();
    }

    public List<String> appIds() {
        return versions.keySet().stream().map(DocumentKey::appId).distinct().sorted().toList();
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
