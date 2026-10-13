package it.lowcode.reference.bff;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Login avviato dalle applicazioni: {@code /bff/login?return=<pagina>}. La pagina di ritorno è accettata solo se sta
 * in una delle origini consentite ({@link BffProperties#frontendOrigins()}): il BFF non fa da trampolino verso siti
 * qualsiasi (open redirect). Dopo il login con Keycloak l'utente torna lì.
 */
@RestController
public class LoginController {

    static final String RETURN_ATTRIBUTE = LoginController.class.getName() + ".return";

    private final BffProperties properties;

    public LoginController(BffProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/bff/login")
    public void login(@RequestParam(value = "return", required = false) String returnTo, HttpServletRequest request,
                      HttpServletResponse response) throws IOException {
        if (returnTo != null) {
            Optional<String> allowed = allowedReturn(returnTo, properties);
            if (allowed.isEmpty()) {
                ApiForwardingFilter.problem(response, HttpStatus.BAD_REQUEST, "Pagina di ritorno non consentita");
                return;
            }
            request.getSession(true).setAttribute(RETURN_ATTRIBUTE, allowed.get());
        }
        response.sendRedirect(request.getContextPath() + "/oauth2/authorization/" + AccessTokens.FromSession.REGISTRATION);
    }

    /** La pagina di ritorno, se è un URL http(s) assoluto in un'origine consentita. */
    static Optional<String> allowedReturn(String url, BffProperties properties) {
        try {
            URI uri = new URI(url);
            if (uri.getScheme() == null || uri.getHost() == null || uri.getUserInfo() != null) {
                return Optional.empty();
            }
            String origin = uri.getScheme() + "://" + uri.getHost() + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
            return properties.frontendOrigins().contains(origin) ? Optional.of(uri.toString()) : Optional.empty();
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
    }

    /** Dopo il login: alla pagina di ritorno salvata, altrimenti alla radice del BFF. */
    @Component
    static class ReturnToFrontend implements AuthenticationSuccessHandler {

        @Override
        public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
                throws IOException {
            HttpSession session = request.getSession(false);
            Object target = session == null ? null : session.getAttribute(RETURN_ATTRIBUTE);
            if (session != null) {
                session.removeAttribute(RETURN_ATTRIBUTE);
            }
            response.sendRedirect(target instanceof String url ? url : request.getContextPath() + "/");
        }
    }
}
