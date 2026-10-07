package it.lowcode.reference.bff;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UserController {

    public record UserInfo(String name, String username) {}

    /** Dati dell'utente autenticato, per il runtime Angular. Non espone mai i token. */
    @GetMapping("/bff/user")
    public UserInfo user(@AuthenticationPrincipal OidcUser user) {
        return new UserInfo(user.getFullName(), user.getPreferredUsername());
    }
}
