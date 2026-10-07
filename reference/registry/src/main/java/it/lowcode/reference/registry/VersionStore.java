package it.lowcode.reference.registry;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;

/** Archivio in memoria: versioni immutabili identificate dall'hash del contenuto, pubblicazione come puntatore. */
@Component
public class VersionStore {

    private record Stored(Model.AppVersion version, String content) {}

    private final Map<String, List<Stored>> versionsByApp = new ConcurrentHashMap<>();
    private final Map<String, Map<String, String>> publishedByApp = new ConcurrentHashMap<>();

    public Model.AppVersion save(String appId, String content, String author) {
        String hash = sha256(content);
        List<Stored> versions = versionsByApp.computeIfAbsent(appId, k -> new CopyOnWriteArrayList<>());
        return versions.stream()
                .filter(s -> s.version().hash().equals(hash))
                .findFirst()
                .map(Stored::version)
                .orElseGet(() -> {
                    Model.AppVersion version = new Model.AppVersion(hash, Instant.now(), author, "bozza");
                    versions.add(new Stored(version, content));
                    return version;
                });
    }

    public List<Model.AppVersion> versions(String appId) {
        List<Model.AppVersion> result = new ArrayList<>();
        versionsByApp.getOrDefault(appId, List.of()).forEach(s -> result.add(s.version()));
        return result.reversed();
    }

    public Optional<String> content(String appId, String hash) {
        return versionsByApp.getOrDefault(appId, List.of()).stream()
                .filter(s -> s.version().hash().equals(hash))
                .map(Stored::content)
                .findFirst();
    }

    /** Fa puntare un ambiente a una versione esistente; false se la versione non esiste. */
    public boolean publish(String appId, String env, String hash) {
        if (content(appId, hash).isEmpty()) {
            return false;
        }
        publishedByApp.computeIfAbsent(appId, k -> new ConcurrentHashMap<>()).put(env, hash);
        return true;
    }

    public Optional<String> publishedHash(String appId, String env) {
        return Optional.ofNullable(publishedByApp.getOrDefault(appId, Map.of()).get(env));
    }

    public Set<String> appIds() {
        return versionsByApp.keySet();
    }

    public List<String> publishedEnvironments(String appId) {
        return List.copyOf(publishedByApp.getOrDefault(appId, Map.of()).keySet());
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
