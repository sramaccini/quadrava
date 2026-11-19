package com.logicwarez.quadrava.reference.bff;

import com.logicwarez.authz.bff.SessionAccessTokens;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * The access token of the session user, renewed when expired (token relay of authz-library). It stays in the BFF: the
 * browser never sees it. An interface so that the tests can give a fake token without Keycloak.
 */
public interface AccessTokens {

    Optional<String> forRequest(HttpServletRequest request, HttpServletResponse response);

    @Component
    class FromSession implements AccessTokens {

        private final SessionAccessTokens tokens;

        public FromSession(SessionAccessTokens tokens) {
            this.tokens = tokens;
        }

        @Override
        public Optional<String> forRequest(HttpServletRequest request, HttpServletResponse response) {
            return tokens.forRequest(request, response);
        }
    }
}
