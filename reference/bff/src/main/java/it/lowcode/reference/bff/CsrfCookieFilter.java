package it.lowcode.reference.bff;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Legge il token CSRF a ogni richiesta, così il cookie {@code XSRF-TOKEN} arriva al browser già con la prima risposta
 * (Spring Security lo crea solo quando qualcuno lo legge). Le applicazioni lo rimandano nell'intestazione
 * {@code X-XSRF-TOKEN} delle scritture.
 */
class CsrfCookieFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Object token = request.getAttribute(CsrfToken.class.getName());
        if (token instanceof CsrfToken csrf) {
            csrf.getToken();
        }
        chain.doFilter(request, response);
    }
}
