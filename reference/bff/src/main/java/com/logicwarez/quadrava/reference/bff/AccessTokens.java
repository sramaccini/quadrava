package com.logicwarez.quadrava.reference.bff;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.stereotype.Component;

/** The access token of the session user, renewed when expired. It stays in the BFF: the browser never sees it. */
public interface AccessTokens {

    Optional<String> forRequest(Authentication user, HttpServletRequest request, HttpServletResponse response);

    @Component
    class FromSession implements AccessTokens {

        static final String REGISTRATION = "keycloak";

        private final OAuth2AuthorizedClientManager clients;

        public FromSession(OAuth2AuthorizedClientManager clients) {
            this.clients = clients;
        }

        @Override
        public Optional<String> forRequest(Authentication user, HttpServletRequest request, HttpServletResponse response) {
            OAuth2AuthorizeRequest authorize = OAuth2AuthorizeRequest.withClientRegistrationId(REGISTRATION)
                    .principal(user)
                    .attribute(HttpServletRequest.class.getName(), request)
                    .attribute(HttpServletResponse.class.getName(), response)
                    .build();
            OAuth2AuthorizedClient client = clients.authorize(authorize);
            return Optional.ofNullable(client).map(c -> c.getAccessToken().getTokenValue());
        }
    }
}
