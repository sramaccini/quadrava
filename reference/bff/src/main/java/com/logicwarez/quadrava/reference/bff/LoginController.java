package com.logicwarez.quadrava.reference.bff;

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
 * Login started by the applications: {@code /bff/login?return=<page>}. The return page is accepted only if it is in one
 * of the allowed origins ({@link BffProperties#frontendOrigins()}): the BFF is not a springboard to arbitrary sites
 * (open redirect). After the Keycloak login the user goes back there.
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
                ApiForwardingFilter.problem(response, HttpStatus.BAD_REQUEST, "Return page not allowed");
                return;
            }
            request.getSession(true).setAttribute(RETURN_ATTRIBUTE, allowed.get());
        }
        response.sendRedirect(request.getContextPath() + "/oauth2/authorization/" + AccessTokens.FromSession.REGISTRATION);
    }

    /** The return page, if it is an absolute http(s) URL in an allowed origin. */
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

    /** The BFF root redirects to the applications (after signing out of Keycloak the user lands here). */
    @GetMapping("/")
    public void home(HttpServletResponse response) throws IOException {
        response.sendRedirect(properties.home());
    }

    /** After the login: to the saved return page, otherwise to the home of the applications. */
    @Component
    static class ReturnToFrontend implements AuthenticationSuccessHandler {

        private final BffProperties properties;

        ReturnToFrontend(BffProperties properties) {
            this.properties = properties;
        }

        @Override
        public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
                throws IOException {
            HttpSession session = request.getSession(false);
            Object target = session == null ? null : session.getAttribute(RETURN_ATTRIBUTE);
            if (session != null) {
                session.removeAttribute(RETURN_ATTRIBUTE);
            }
            response.sendRedirect(target instanceof String url ? url : properties.home());
        }
    }
}
