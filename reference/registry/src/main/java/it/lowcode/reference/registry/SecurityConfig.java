package it.lowcode.reference.registry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Il registro accetta solo richieste con un token JWT di Keycloak (in produzione glielo aggiunge il BFF).
 *
 * <p>Il profilo {@code no-auth} serve solo a provare editor e runtime in locale senza Keycloak: nessuna
 * autenticazione, autore delle versioni «developer». Va attivato a mano ({@code --spring.profiles.active=no-auth})
 * e all'avvio lo segnala nel log.
 */
@Configuration
public class SecurityConfig {

    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    @Profile("!no-auth")
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(a -> a
                        .requestMatchers("/actuator/health/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))
                .csrf(AbstractHttpConfigurer::disable);
        return http.build();
    }

    @Bean
    @Profile("no-auth")
    SecurityFilterChain senzaAutenticazione(HttpSecurity http) throws Exception {
        log.warn("Registro avviato SENZA autenticazione (profilo no-auth): solo per lo sviluppo locale.");
        http.authorizeHttpRequests(a -> a.anyRequest().permitAll()).csrf(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
