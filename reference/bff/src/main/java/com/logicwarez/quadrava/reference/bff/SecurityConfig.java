package com.logicwarez.quadrava.reference.bff;

import com.logicwarez.authz.bff.BffConfigurer;
import com.logicwarez.authz.bff.BffControllers;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * The session of the BFF is that of authz-library ({@link BffConfigurer}): OIDC login with Keycloak, the session in
 * Redis with the roles and permissions of {@link ConfiguredAuthorization}, 401 without a session (never a redirect),
 * CSRF for single-page applications ({@code XSRF-TOKEN} cookie, {@code X-XSRF-TOKEN} header), the Origin check on
 * writes and the back-channel logout of Keycloak. The tokens stay in the session: the browser only gets its cookie.
 */
@Configuration
@EnableConfigurationProperties(BffProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.with(BffConfigurer.bff(), Customizer.withDefaults())
                .authorizeHttpRequests(a -> a
                        .requestMatchers(BffControllers.PUBLIC_PATHS).permitAll()
                        .requestMatchers("/actuator/health/**").permitAll()
                        .anyRequest().authenticated());
        return http.build();
    }
}
