package it.lowcode.reference.registry;

import java.time.Instant;
import java.util.List;

/** Tipi del contratto contracts/registry.yaml. */
public final class Model {
    private Model() {}

    public record AppSummary(String id, String name, List<String> publishedEnvironments) {}

    public record AppVersion(String hash, Instant createdAt, String author, String state) {}

    public record PublishRequest(String hash) {}
}
