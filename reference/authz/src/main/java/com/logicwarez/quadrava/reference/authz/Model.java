package com.logicwarez.quadrava.reference.authz;

import java.util.List;

/** Types of the contract contracts/authz.yaml. */
public final class Model {
    private Model() {}

    public record Capabilities(List<String> permissions, String version, int ttlSeconds) {}

    public record ResourceRef(String type, String id) {}

    public record CheckItem(String permission, ResourceRef resource) {}

    /** The checks and, optionally, the operational role to answer for (0.2). */
    public record CheckRequest(List<CheckItem> checks, String role) {
        public CheckRequest(List<CheckItem> checks) {
            this(checks, null);
        }
    }

    public record CheckResult(String permission, ResourceRef resource, boolean allowed) {}

    public record CheckResponse(List<CheckResult> results) {}

    /** A role of the user: base roles always apply, operational ones are chosen one at a time (0.2). */
    public record Role(String id, String label, boolean base) {}
}
