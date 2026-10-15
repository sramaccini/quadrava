package it.lowcode.reference.bff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oauth2Login;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * API forwarding, security of the applications' calls and login with return. The downstream service is a fake HTTP
 * server that records the requests; the access token is fake (no Keycloak needed).
 */
@SpringBootTest
class ApiForwardingTest {

    record Received(String method, String uri, Map<String, List<String>> headers, String body) {}

    static HttpServer upstream;
    static final List<Received> received = new CopyOnWriteArrayList<>();

    @BeforeAll
    static void startUpstream() throws IOException {
        upstream = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        upstream.createContext("/", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            received.add(new Received(exchange.getRequestMethod(), exchange.getRequestURI().toString(), exchange.getRequestHeaders(), body));
            byte[] reply = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.getResponseHeaders().add("ETag", "\"v1\"");
            exchange.getResponseHeaders().add("Set-Cookie", "internal=1");
            exchange.getResponseHeaders().add("X-Internal", "secret");
            exchange.sendResponseHeaders(exchange.getRequestMethod().equals("POST") ? 201 : 200, reply.length);
            exchange.getResponseBody().write(reply);
            exchange.close();
        });
        upstream.start();
    }

    @AfterAll
    static void stopUpstream() {
        upstream.stop(0);
    }

    @DynamicPropertySource
    static void routes(DynamicPropertyRegistry registry) {
        registry.add("lowcode.bff.routes[0].prefix", () -> "/registry");
        registry.add("lowcode.bff.routes[0].target", () -> "http://localhost:" + upstream.getAddress().getPort());
        // A service that is down: nobody listens on this port.
        registry.add("lowcode.bff.routes[1].prefix", () -> "/down");
        registry.add("lowcode.bff.routes[1].target", () -> "http://localhost:1");
        registry.add("lowcode.bff.frontend-origins[0]", () -> "http://localhost:4201");
        registry.add("lowcode.bff.home", () -> "http://localhost:4200/");
        registry.add("lowcode.bff.end-session-uri", () -> "http://idp.test/logout");
    }

    @TestConfiguration
    static class FakeTokens {
        @Bean
        @Primary
        AccessTokens fakeAccessTokens() {
            return (user, request, response) -> Optional.of("test-token");
        }
    }

    @Autowired
    WebApplicationContext context;

    @Autowired
    @Qualifier("springSecurityFilterChain")
    Filter security;

    @Autowired
    ApiForwardingFilter forwarding;

    @Autowired
    BffProperties properties;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        received.clear();
        // Security first, then forwarding: as in the real server.
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security, forwarding).build();
    }

    @Test
    void withoutASessionApisAnswer401AndPagesGoToTheLogin() throws Exception {
        mvc.perform(get("/registry/apps")).andExpect(status().isUnauthorized());
        mvc.perform(get("/bff/user")).andExpect(status().isUnauthorized());
        // A browser asking for a page (Accept: text/html) goes to the login.
        mvc.perform(get("/a-page").accept(MediaType.TEXT_HTML)).andExpect(status().is3xxRedirection());
        assertThat(received).isEmpty();
    }

    @Test
    void forwardsWithTheSessionTokenWithoutCookiesAndReturnsOnlySafeHeaders() throws Exception {
        mvc.perform(get("/registry/apps/demo/documents/screen/ordini-elenco/published").queryParam("env", "production")
                        .with(oauth2Login())
                        .header("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
                        .header("Authorization", "Bearer from-the-browser")
                        .cookie(new Cookie("JSESSIONID", "session")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"ok\":true}"))
                .andExpect(header().string("ETag", "\"v1\""))
                // The service's cookies do not reach the browser (the CSRF one belongs to the BFF).
                .andExpect(cookie().doesNotExist("internal"))
                .andExpect(header().doesNotExist("X-Internal"));
        assertThat(received).hasSize(1);
        Received r = received.getFirst();
        assertThat(r.uri()).isEqualTo("/registry/apps/demo/documents/screen/ordini-elenco/published?env=production");
        assertThat(r.headers().get("Authorization")).containsExactly("Bearer test-token");
        assertThat(r.headers().get("Traceparent")).containsExactly("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
        assertThat(r.headers()).doesNotContainKey("Cookie");
    }

    @Test
    void theCsrfCookieArrivesWithTheFirstResponse() throws Exception {
        mvc.perform(get("/registry/apps").with(oauth2Login()))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    // csrf() of spring-security-test replaces the token repository in the shared filter for good: after this test a
    // clean context is used.
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void writesRequireTheCsrfToken() throws Exception {
        String doc = "{\"schemaVersion\":\"1.0\",\"screen\":\"ordini-elenco\"}";
        mvc.perform(post("/registry/apps/demo/documents/screen/ordini-elenco/versions").with(oauth2Login())
                        .contentType(MediaType.APPLICATION_JSON).content(doc))
                .andExpect(status().isForbidden());
        assertThat(received).isEmpty();
        mvc.perform(post("/registry/apps/demo/documents/screen/ordini-elenco/versions").with(oauth2Login()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(doc))
                .andExpect(status().isCreated());
        assertThat(received.getFirst().method()).isEqualTo("POST");
        assertThat(received.getFirst().body()).isEqualTo(doc);
    }

    @Test
    void serviceDownAndOddPathsDoNotPass() throws Exception {
        mvc.perform(get("/down/something").with(oauth2Login()))
                .andExpect(status().isBadGateway())
                .andExpect(content().json("{\"title\":\"Service unreachable\",\"status\":502}"));
        mvc.perform(get("/registry/%2e%2e/actuator/env").with(oauth2Login())).andExpect(status().isBadRequest());
        assertThat(received).isEmpty();
    }

    @Test
    void loginReturnsOnlyToTheAllowedApplications() throws Exception {
        mvc.perform(get("/bff/login").queryParam("return", "http://localhost:4201/?preview"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/oauth2/authorization/keycloak"))
                .andExpect(request().sessionAttribute(LoginController.RETURN_ATTRIBUTE, "http://localhost:4201/?preview"));
        mvc.perform(get("/bff/login").queryParam("return", "https://other.example/")).andExpect(status().isBadRequest());
        mvc.perform(get("/bff/login").queryParam("return", "http://user@localhost:4201/")).andExpect(status().isBadRequest());
    }

    @Test
    void afterTheLoginTheSavedPageIsOpened() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(LoginController.RETURN_ATTRIBUTE, "http://localhost:4201/");
        MockHttpServletResponse response = new MockHttpServletResponse();
        new LoginController.ReturnToFrontend(properties).onAuthenticationSuccess(request, response, null);
        assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:4201/");
        // Without a saved page: the home of the applications.
        MockHttpServletResponse other = new MockHttpServletResponse();
        new LoginController.ReturnToFrontend(properties).onAuthenticationSuccess(new MockHttpServletRequest(), other, null);
        assertThat(other.getRedirectedUrl()).isEqualTo("http://localhost:4200/");
    }

    @Test
    void signingOutAlsoClosesTheKeycloakSession() throws Exception {
        mvc.perform(post("/logout").with(oidcLogin()).with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl())
                        .startsWith("http://idp.test/logout?id_token_hint=")
                        .endsWith("&post_logout_redirect_uri=http%3A%2F%2Flocalhost%2F"));
        mvc.perform(get("/").with(oidcLogin())).andExpect(redirectedUrl("http://localhost:4200/"));
        // From the applications: a JSON call, which receives the address to go to.
        mvc.perform(post("/logout").with(oidcLogin()).with(csrf()).accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).startsWith("{\"redirect\":\"http://idp.test/logout?id_token_hint="));
    }
}
