package it.lowcode.reference.authz;

import java.util.List;

/** Tipi del contratto contracts/authz.yaml. */
public final class Model {
    private Model() {}

    public record Capabilities(List<String> permissions, String version, int ttlSeconds) {}

    public record ResourceRef(String type, String id) {}

    public record CheckItem(String permission, ResourceRef resource) {}

    public record CheckRequest(List<CheckItem> checks) {}

    public record CheckResult(String permission, ResourceRef resource, boolean allowed) {}

    public record CheckResponse(List<CheckResult> results) {}
}
