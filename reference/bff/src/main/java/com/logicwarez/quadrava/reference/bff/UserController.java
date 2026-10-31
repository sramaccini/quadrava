package com.logicwarez.quadrava.reference.bff;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

    /** The user of the session (contracts/bff.yaml, User): never the tokens. Missing fields are left out, not null. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record UserInfo(String name, String username, String email, List<TenantInfo> tenants, String currentTenant) {}

    /** A tenant as the applications see it: who may use it stays in the BFF. */
    public record TenantInfo(String id, String label) {}

    private final Tenants tenants;

    public UserController(Tenants tenants) {
        this.tenants = tenants;
    }

    /** Data of the authenticated user, for the Angular runtime. It never exposes the tokens. */
    @GetMapping("/bff/user")
    public UserInfo user(@AuthenticationPrincipal OidcUser user, Authentication authentication, HttpServletRequest request) {
        String username = Tenants.username(authentication);
        List<TenantInfo> offered = tenants.offeredTo(username).stream().map(t -> new TenantInfo(t.id(), t.label())).toList();
        String current = tenants.current(request.getSession(), username).map(BffProperties.Tenant::id).orElse(null);
        return new UserInfo(user.getFullName(), user.getPreferredUsername(), user.getEmail(), offered.isEmpty() ? null : offered, current);
    }
}
