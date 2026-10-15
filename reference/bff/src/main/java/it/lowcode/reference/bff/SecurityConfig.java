package it.lowcode.reference.bff;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientProviderBuilder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Server-side session: the OAuth2 login (Authorization Code with PKCE) happens here and the tokens stay in the BFF; the
 * browser only gets the session cookie.
 *
 * <ul>
 *   <li>The APIs ({@code /bff/**} and the forwarded prefixes) answer 401 without a session instead of redirecting to the
 *       login: the applications show «Sign in» and go through {@code /bff/login?return=...}.</li>
 *   <li>CSRF for single-page applications: the token is in the {@code XSRF-TOKEN} cookie (readable by the browser) and
 *       comes back in the {@code X-XSRF-TOKEN} header of writes.</li>
 * </ul>
 */
@Configuration
@EnableConfigurationProperties(BffProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, BffProperties properties, LoginController.ReturnToFrontend returnToFrontend,
                                            EndSessionLogout endSessionLogout)
            throws Exception {
        RequestMatcher api = apiMatcher(properties);
        http.authorizeHttpRequests(a -> a
                        .requestMatchers("/actuator/health/**", "/bff/login").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.defaultAuthenticationEntryPointFor(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), api))
                // spa() decides how to read the token from the request; the cookie repository (readable by the browser) is set separately.
                .csrf(c -> c.spa().csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .oauth2Login(o -> o.successHandler(returnToFrontend))
                .logout(l -> l.logoutSuccessHandler(endSessionLogout));
        return http.build();
    }

    /** The requests of the applications (not browser navigation): {@code /bff/**} and the forwarded prefixes. */
    static RequestMatcher apiMatcher(BffProperties properties) {
        List<RequestMatcher> matchers = new ArrayList<>();
        matchers.add(PathPatternRequestMatcher.withDefaults().matcher("/bff/**"));
        for (BffProperties.Route route : properties.routes()) {
            matchers.add(PathPatternRequestMatcher.withDefaults().matcher(route.prefix()));
            matchers.add(PathPatternRequestMatcher.withDefaults().matcher(route.prefix() + "/**"));
        }
        return new OrRequestMatcher(matchers);
    }

    /** Gets and renews the access tokens of the user (refresh token), for forwarding the APIs. */
    @Bean
    OAuth2AuthorizedClientManager authorizedClientManager(ClientRegistrationRepository registrations,
                                                          OAuth2AuthorizedClientRepository clients) {
        DefaultOAuth2AuthorizedClientManager manager = new DefaultOAuth2AuthorizedClientManager(registrations, clients);
        manager.setAuthorizedClientProvider(OAuth2AuthorizedClientProviderBuilder.builder().authorizationCode().refreshToken().build());
        return manager;
    }
}
