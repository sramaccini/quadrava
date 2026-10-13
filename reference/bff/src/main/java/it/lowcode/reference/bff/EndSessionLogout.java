package it.lowcode.reference.bff;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * Dopo l'uscita dal BFF chiude anche la sessione in Keycloak (logout OIDC avviato dal client): altrimenti un nuovo
 * accesso rientrerebbe senza chiedere la password. Keycloak poi riporta alla radice del BFF, che rimanda alle
 * applicazioni (e quindi al login).
 *
 * Le applicazioni escono con una chiamata ({@code Accept: application/json}, token CSRF nell'intestazione): la risposta
 * è {@code {"redirect": "<indirizzo>"}} e la pagina ci naviga. Una navigazione normale riceve invece il reindirizzamento.
 */
@Component
class EndSessionLogout implements LogoutSuccessHandler {

    private final BffProperties properties;

    EndSessionLogout(BffProperties properties) {
        this.properties = properties;
    }

    @Override
    public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        if (authentication != null && authentication.getPrincipal() instanceof OidcUser user && properties.endSessionUri() != null) {
            String back = baseUrl(request) + "/";
            String url = properties.endSessionUri()
                    + "?id_token_hint=" + encode(user.getIdToken().getTokenValue())
                    + "&post_logout_redirect_uri=" + encode(back);
            answer(request, response, url);
            return;
        }
        answer(request, response, properties.home());
    }

    private static void answer(HttpServletRequest request, HttpServletResponse response, String url) throws IOException {
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains("application/json")) {
            response.setContentType("application/json");
            response.getWriter().write("{\"redirect\":\"" + url.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}");
            return;
        }
        response.sendRedirect(url);
    }

    static String baseUrl(HttpServletRequest request) {
        int port = request.getServerPort();
        boolean standard = ("http".equals(request.getScheme()) && port == 80) || ("https".equals(request.getScheme()) && port == 443);
        return request.getScheme() + "://" + request.getServerName() + (standard ? "" : ":" + port) + request.getContextPath();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
