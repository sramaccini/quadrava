package com.logicwarez.quadrava.reference.bff;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads the CSRF token on every request, so the {@code XSRF-TOKEN} cookie reaches the browser with the very first
 * response (Spring Security creates it only when someone reads it). The applications send it back in the
 * {@code X-XSRF-TOKEN} header of writes.
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
