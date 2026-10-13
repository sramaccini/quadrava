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
 * Sessione lato server: il login OAuth2 (Authorization Code con PKCE) avviene qui e i token restano nel BFF; il
 * browser riceve solo il cookie di sessione.
 *
 * <ul>
 *   <li>Le API ({@code /bff/**} e i prefissi inoltrati) rispondono 401 senza sessione, invece di reindirizzare al
 *       login: le applicazioni mostrano «Accedi» e passano da {@code /bff/login?return=...}.</li>
 *   <li>CSRF per applicazioni a pagina singola: il token sta nel cookie {@code XSRF-TOKEN} (leggibile dal browser) e
 *       torna nell'intestazione {@code X-XSRF-TOKEN} delle scritture.</li>
 * </ul>
 */
@Configuration
@EnableConfigurationProperties(BffProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, BffProperties properties, LoginController.ReturnToFrontend returnToFrontend)
            throws Exception {
        RequestMatcher api = apiMatcher(properties);
        http.authorizeHttpRequests(a -> a
                        .requestMatchers("/actuator/health/**", "/bff/login").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.defaultAuthenticationEntryPointFor(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), api))
                // spa() decide come leggere il token dalla richiesta; il repository a cookie (leggibile dal browser) va detto a parte.
                .csrf(c -> c.spa().csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
                .oauth2Login(o -> o.successHandler(returnToFrontend))
                .logout(l -> l.logoutSuccessUrl("/"));
        return http.build();
    }

    /** Le richieste delle applicazioni (non della navigazione del browser): {@code /bff/**} e i prefissi inoltrati. */
    static RequestMatcher apiMatcher(BffProperties properties) {
        List<RequestMatcher> matchers = new ArrayList<>();
        matchers.add(PathPatternRequestMatcher.withDefaults().matcher("/bff/**"));
        for (BffProperties.Route route : properties.routes()) {
            matchers.add(PathPatternRequestMatcher.withDefaults().matcher(route.prefix()));
            matchers.add(PathPatternRequestMatcher.withDefaults().matcher(route.prefix() + "/**"));
        }
        return new OrRequestMatcher(matchers);
    }

    /** Ottiene e rinnova i token d'accesso dell'utente (refresh token), per l'inoltro delle API. */
    @Bean
    OAuth2AuthorizedClientManager authorizedClientManager(ClientRegistrationRepository registrations,
                                                          OAuth2AuthorizedClientRepository clients) {
        DefaultOAuth2AuthorizedClientManager manager = new DefaultOAuth2AuthorizedClientManager(registrations, clients);
        manager.setAuthorizedClientProvider(OAuth2AuthorizedClientProviderBuilder.builder().authorizationCode().refreshToken().build());
        return manager;
    }
}
