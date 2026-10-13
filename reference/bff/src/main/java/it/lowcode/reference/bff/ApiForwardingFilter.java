package it.lowcode.reference.bff;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Inoltra le API configurate ({@link BffProperties#routes()}) ai servizi, con il token d'accesso dell'utente della
 * sessione. Il browser parla solo con il BFF: niente token nel browser, niente host arbitrari.
 *
 * <ul>
 *   <li>Arrivano al servizio solo poche intestazioni (formato, cache condizionale, lingua, {@code traceparent}): mai i
 *       cookie della sessione né un'eventuale {@code Authorization} del browser.</li>
 *   <li>Tornano al browser solo stato, corpo e poche intestazioni sicure (tipo, ETag, cache, nome del file).</li>
 *   <li>Il corpo passa in streaming, entro {@link BffProperties#maxBodyBytes()} (i file arrivano fino a 100 MB).</li>
 * </ul>
 *
 * Gira dopo la catena di sicurezza: l'autenticazione (401 per le API) e la protezione CSRF sono già state applicate.
 */
@Component
public class ApiForwardingFilter extends OncePerRequestFilter {

    private static final List<String> REQUEST_HEADERS = List.of(
            "Accept", "Accept-Language", "Content-Type", "If-None-Match", "If-Match", "If-Modified-Since", "traceparent", "tracestate");
    private static final List<String> RESPONSE_HEADERS = List.of(
            "Content-Type", "ETag", "Cache-Control", "Last-Modified", "Content-Disposition");
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final BffProperties properties;
    private final AccessTokens tokens;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public ApiForwardingFilter(BffProperties properties, AccessTokens tokens) {
        this.properties = properties;
        this.tokens = tokens;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return route(request).isEmpty();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        BffProperties.Route route = route(request).orElseThrow();
        String rawPath = request.getRequestURI().substring(request.getContextPath().length());
        // Niente percorsi relativi: il servizio deve ricevere esattamente il prefisso configurato.
        if (rawPath.contains("..") || rawPath.contains("%2e") || rawPath.contains("%2E") || rawPath.contains("\\")) {
            problem(response, HttpStatus.BAD_REQUEST, "Percorso non valido");
            return;
        }
        long length = request.getContentLengthLong();
        if (length > properties.maxBodyBytes()) {
            problem(response, HttpStatus.CONTENT_TOO_LARGE, "Corpo troppo grande");
            return;
        }
        Authentication user = SecurityContextHolder.getContext().getAuthentication();
        Optional<String> token = user == null ? Optional.empty() : tokens.forRequest(user, request, response);
        if (token.isEmpty()) {
            problem(response, HttpStatus.UNAUTHORIZED, "Sessione scaduta");
            return;
        }

        String query = request.getQueryString();
        URI target = URI.create(route.target().toString().replaceAll("/+$", "") + rawPath + (query == null ? "" : "?" + query));
        HttpRequest.Builder upstream = HttpRequest.newBuilder(target).timeout(Duration.ofSeconds(60));
        for (String name : REQUEST_HEADERS) {
            String value = request.getHeader(name);
            if (value != null) {
                upstream.header(name, value);
            }
        }
        upstream.header("Authorization", "Bearer " + token.get());
        String method = request.getMethod();
        if (BODY_METHODS.contains(method)) {
            InputStream body = request.getInputStream();
            upstream.method(method, HttpRequest.BodyPublishers.ofInputStream(() -> body));
        } else {
            upstream.method(method, HttpRequest.BodyPublishers.noBody());
        }

        HttpResponse<InputStream> reply;
        try {
            reply = http.send(upstream.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
            problem(response, HttpStatus.BAD_GATEWAY, "Servizio non raggiungibile");
            return;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            problem(response, HttpStatus.BAD_GATEWAY, "Servizio non raggiungibile");
            return;
        }

        response.setStatus(reply.statusCode());
        for (String name : RESPONSE_HEADERS) {
            reply.headers().firstValue(name).ifPresent(value -> response.setHeader(name, value));
        }
        try (InputStream in = reply.body(); OutputStream out = response.getOutputStream()) {
            in.transferTo(out);
        }
    }

    private Optional<BffProperties.Route> route(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return properties.routes().stream().filter(r -> r.matches(path)).findFirst();
    }

    static void problem(HttpServletResponse response, HttpStatus status, String title) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write("{\"title\":\"" + title + "\",\"status\":" + status.value() + "}");
    }
}
