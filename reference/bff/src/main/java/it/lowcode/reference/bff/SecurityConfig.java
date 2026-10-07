package it.lowcode.reference.bff;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Sessione lato server: il login OAuth2 (Authorization Code con PKCE) avviene qui e i token restano nel BFF.
 * Il browser riceve solo il cookie di sessione.
 * Da completare: protezione CSRF per il frontend Angular, inoltro delle API con token e traceparent, elenco degli host consentiti.
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(a -> a
                        .requestMatchers("/actuator/health/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2Login(Customizer.withDefaults())
                .logout(l -> l.logoutSuccessUrl("/"));
        return http.build();
    }
}
