package com.logicwarez.quadrava.reference.registry;

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
 * The registry accepts only requests with a Keycloak JWT (in production the BFF adds it).
 *
 * <p>The {@code no-auth} profile is only for trying the editor and the runtime locally without Keycloak: no
 * authentication, versions authored by «developer». It must be switched on by hand
 * ({@code --spring.profiles.active=no-auth}) and it says so in the log at start-up.
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
    SecurityFilterChain withoutAuthentication(HttpSecurity http) throws Exception {
        log.warn("Registry started WITHOUT authentication (no-auth profile): for local development only.");
        http.authorizeHttpRequests(a -> a.anyRequest().permitAll()).csrf(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
