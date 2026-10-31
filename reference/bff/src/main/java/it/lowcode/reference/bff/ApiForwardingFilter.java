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
 * Forwards the configured APIs ({@link BffProperties#routes()}) to the services, with the access token of the session
 * user. The browser talks only to the BFF: no tokens in the browser, no arbitrary hosts.
 *
 * <ul>
 *   <li>Only a few headers reach the service (format, conditional cache, language, {@code traceparent}): never the
 *       session cookies nor any {@code Authorization} from the browser. The tenant of the session, if any, goes in
 *       {@code X-Tenant}.</li>
 *   <li>Only status, body and a few safe headers (type, ETag, cache, file name, permissions version) go back to the browser.</li>
 *   <li>The body is streamed, within {@link BffProperties#maxBodyBytes()} (files go up to 100 MB). An event stream
 *       ({@code text/event-stream}, the data sources with {@code live}) is passed on as it arrives, flushed after every
 *       read, and stays open as long as the service keeps it.</li>
 * </ul>
 *
 * It runs after the security chain: authentication (401 for APIs) and CSRF protection have already been applied.
 */
@Component
public class ApiForwardingFilter extends OncePerRequestFilter {

    private static final List<String> REQUEST_HEADERS = List.of(
            "Accept", "Accept-Language", "Content-Type", "If-None-Match", "If-Match", "If-Modified-Since", "traceparent", "tracestate");
    private static final List<String> RESPONSE_HEADERS = List.of(
            "Content-Type", "ETag", "Cache-Control", "Last-Modified", "Content-Disposition", "X-Permissions-Version");
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final BffProperties properties;
    private final AccessTokens tokens;
    private final Tenants tenants;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public ApiForwardingFilter(BffProperties properties, AccessTokens tokens, Tenants tenants) {
        this.properties = properties;
        this.tokens = tokens;
        this.tenants = tenants;
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
        // No relative paths: the service must receive exactly the configured prefix.
        if (rawPath.contains("..") || rawPath.contains("%2e") || rawPath.contains("%2E") || rawPath.contains("\\")) {
            problem(response, HttpStatus.BAD_REQUEST, "Invalid path");
            return;
        }
        long length = request.getContentLengthLong();
        if (length > properties.maxBodyBytes()) {
            problem(response, HttpStatus.CONTENT_TOO_LARGE, "Body too large");
            return;
        }
        Authentication user = SecurityContextHolder.getContext().getAuthentication();
        Optional<String> token = user == null ? Optional.empty() : tokens.forRequest(user, request, response);
        if (token.isEmpty()) {
            problem(response, HttpStatus.UNAUTHORIZED, "Session expired");
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
        // The tenant of the session, if any: the one from the browser never passes (it is not in REQUEST_HEADERS).
        tenants.current(request.getSession(false), Tenants.username(user)).ifPresent(t -> upstream.header("X-Tenant", t.id()));
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
            problem(response, HttpStatus.BAD_GATEWAY, "Service unreachable");
            return;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            problem(response, HttpStatus.BAD_GATEWAY, "Service unreachable");
            return;
        }

        response.setStatus(reply.statusCode());
        for (String name : RESPONSE_HEADERS) {
            reply.headers().firstValue(name).ifPresent(value -> response.setHeader(name, value));
        }
        boolean events = reply.headers().firstValue("Content-Type").map(t -> t.startsWith("text/event-stream")).orElse(false);
        try (InputStream in = reply.body(); OutputStream out = response.getOutputStream()) {
            if (events) {
                // Every event must reach the browser when it arrives, not when a buffer is full.
                response.flushBuffer();
                byte[] buffer = new byte[8192];
                for (int read; (read = in.read(buffer)) >= 0; ) {
                    out.write(buffer, 0, read);
                    out.flush();
                }
            } else {
                in.transferTo(out);
            }
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
