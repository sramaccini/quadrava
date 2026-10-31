package it.lowcode.reference.bff;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

    /** The user of the session (contracts/bff.yaml, User): never the tokens. Missing fields are left out, not null. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record UserInfo(String name, String username, String email) {}

    /** Data of the authenticated user, for the Angular runtime. It never exposes the tokens. */
    @GetMapping("/bff/user")
    public UserInfo user(@AuthenticationPrincipal OidcUser user) {
        return new UserInfo(user.getFullName(), user.getPreferredUsername(), user.getEmail());
    }
}
