package it.lowcode.reference.bff;

import jakarta.servlet.http.HttpSession;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

/**
 * Tenants of the users (contracts/bff.yaml, optional part): which ones each user may work on and the one of the session.
 * The login opens the session on the last tenant the user chose, or on the first one offered: it never asks. The BFF
 * does not interpret what a tenant is; it forwards the current one to the services ({@link ApiForwardingFilter}).
 */
@Component
public class Tenants {

    static final String SESSION_ATTRIBUTE = Tenants.class.getName() + ".current";

    private final BffProperties properties;
    /** Last tenant chosen by each user. In memory, like everything in the reference BFF: lost at restart. */
    private final Map<String, String> lastUsed = new ConcurrentHashMap<>();

    public Tenants(BffProperties properties) {
        this.properties = properties;
    }

    /** The key of the user in the configuration of the tenants: the login name. */
    static String username(Authentication user) {
        return user.getPrincipal() instanceof OidcUser oidc && oidc.getPreferredUsername() != null ? oidc.getPreferredUsername() : user.getName();
    }

    /** The tenants offered to a user: those that list them, or that list nobody. */
    List<BffProperties.Tenant> offeredTo(String username) {
        return properties.tenants().stream().filter(t -> t.users().isEmpty() || t.users().contains(username)).toList();
    }

    /** The tenant of the session; the first time, the last one used or the first one offered. Empty without tenants. */
    Optional<BffProperties.Tenant> current(HttpSession session, String username) {
        List<BffProperties.Tenant> offered = offeredTo(username);
        Object chosen = session == null ? null : session.getAttribute(SESSION_ATTRIBUTE);
        Optional<BffProperties.Tenant> tenant = find(offered, chosen)
                .or(() -> find(offered, lastUsed.get(username)))
                .or(() -> offered.stream().findFirst());
        if (session != null) {
            tenant.ifPresent(t -> session.setAttribute(SESSION_ATTRIBUTE, t.id()));
        }
        return tenant;
    }

    /** Moves the session to a tenant offered to the user; false if it is not one of them. */
    boolean select(HttpSession session, String username, String id) {
        Optional<BffProperties.Tenant> tenant = find(offeredTo(username), id);
        tenant.ifPresent(t -> {
            session.setAttribute(SESSION_ATTRIBUTE, t.id());
            lastUsed.put(username, t.id());
        });
        return tenant.isPresent();
    }

    private static Optional<BffProperties.Tenant> find(List<BffProperties.Tenant> offered, Object id) {
        return offered.stream().filter(t -> t.id().equals(id)).findFirst();
    }
}
