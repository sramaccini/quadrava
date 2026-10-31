package com.logicwarez.quadrava.reference.bff;

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
import org.springframework.mock.web.MockHttpSession;
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
            exchange.getResponseHeaders().add("X-Permissions-Version", "7");
            exchange.getResponseHeaders().add("Set-Cookie", "internal=1");
            exchange.getResponseHeaders().add("X-Internal", "secret");
            exchange.sendResponseHeaders(exchange.getRequestMethod().equals("POST") ? 201 : 200, reply.length);
            exchange.getResponseBody().write(reply);
            exchange.close();
        });
        // An event stream: two events written separately, without a declared length.
        upstream.createContext("/registry/events", exchange -> {
            received.add(new Received(exchange.getRequestMethod(), exchange.getRequestURI().toString(), exchange.getRequestHeaders(), ""));
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            for (String event : List.of("event: tasks.changed\ndata: {}\n\n", "event: comments.added\ndata: {}\n\n")) {
                exchange.getResponseBody().write(event.getBytes(StandardCharsets.UTF_8));
                exchange.getResponseBody().flush();
            }
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
        registry.add("quadrava.bff.routes[0].prefix", () -> "/registry");
        registry.add("quadrava.bff.routes[0].target", () -> "http://localhost:" + upstream.getAddress().getPort());
        // A service that is down: nobody listens on this port.
        registry.add("quadrava.bff.routes[1].prefix", () -> "/down");
        registry.add("quadrava.bff.routes[1].target", () -> "http://localhost:1");
        registry.add("quadrava.bff.frontend-origins[0]", () -> "http://localhost:4201");
        registry.add("quadrava.bff.home", () -> "http://localhost:4200/");
        registry.add("quadrava.bff.end-session-uri", () -> "http://idp.test/logout");
        // Two tenants for grace only: the other users have none.
        registry.add("quadrava.bff.tenants[0].id", () -> "north");
        registry.add("quadrava.bff.tenants[0].label", () -> "North office");
        registry.add("quadrava.bff.tenants[0].users[0]", () -> "grace");
        registry.add("quadrava.bff.tenants[1].id", () -> "south");
        registry.add("quadrava.bff.tenants[1].label", () -> "South office");
        registry.add("quadrava.bff.tenants[1].users[0]", () -> "grace");
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
        mvc.perform(get("/registry/apps/demo/documents/screen/order-list/published").queryParam("env", "production")
                        .with(oauth2Login())
                        .header("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
                        .header("Authorization", "Bearer from-the-browser")
                        .cookie(new Cookie("JSESSIONID", "session")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"ok\":true}"))
                .andExpect(header().string("ETag", "\"v1\""))
                // The runtime reloads the permissions when this changes (authz.yaml).
                .andExpect(header().string("X-Permissions-Version", "7"))
                // The service's cookies do not reach the browser (the CSRF one belongs to the BFF).
                .andExpect(cookie().doesNotExist("internal"))
                .andExpect(header().doesNotExist("X-Internal"));
        assertThat(received).hasSize(1);
        Received r = received.getFirst();
        assertThat(r.uri()).isEqualTo("/registry/apps/demo/documents/screen/order-list/published?env=production");
        assertThat(r.headers().get("Authorization")).containsExactly("Bearer test-token");
        assertThat(r.headers().get("Traceparent")).containsExactly("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
        assertThat(r.headers()).doesNotContainKey("Cookie");
    }

    @Test
    void eventStreamsPassWithTheTokenAndTheirType() throws Exception {
        mvc.perform(get("/registry/events").with(oauth2Login()).accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/event-stream"))
                .andExpect(content().string("event: tasks.changed\ndata: {}\n\nevent: comments.added\ndata: {}\n\n"));
        assertThat(received.getFirst().headers().get("Authorization")).containsExactly("Bearer test-token");
    }

    @Test
    void theUserOfTheSessionHasNoTokensAndNoEmptyFields() throws Exception {
        mvc.perform(get("/bff/user").with(oidcLogin().idToken(t -> t.claim("name", "Ada Lovelace").claim("preferred_username", "ada").claim("email", "ada@example.test"))))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"name\":\"Ada Lovelace\",\"username\":\"ada\",\"email\":\"ada@example.test\"}", org.springframework.test.json.JsonCompareMode.STRICT));
        // Without an e-mail the field is left out, not null.
        mvc.perform(get("/bff/user").with(oidcLogin().idToken(t -> t.claim("preferred_username", "ada"))))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).doesNotContain("email").doesNotContain("null"));
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
        String doc = "{\"schemaVersion\":\"1.0\",\"screen\":\"order-list\"}";
        mvc.perform(post("/registry/apps/demo/documents/screen/order-list/versions").with(oauth2Login())
                        .contentType(MediaType.APPLICATION_JSON).content(doc))
                .andExpect(status().isForbidden());
        assertThat(received).isEmpty();
        mvc.perform(post("/registry/apps/demo/documents/screen/order-list/versions").with(oauth2Login()).with(csrf())
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

    @Test
    // csrf() replaces the token repository for good (see writesRequireTheCsrfToken).
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void theUserSwitchesTenantWithAPostAndTheNextSessionStartsOnTheLastOne() throws Exception {
        MockHttpSession session = new MockHttpSession();
        mvc.perform(get("/bff/user").session(session).with(grace()))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"tenants\":[{\"id\":\"north\",\"label\":\"North office\"},{\"id\":\"south\",\"label\":\"South office\"}],\"currentTenant\":\"north\"}"));
        // Who may use a tenant stays in the BFF.
        mvc.perform(get("/bff/user").session(session).with(grace()))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).doesNotContain("users"));

        mvc.perform(post("/bff/tenant").session(session).with(grace()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"south\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/bff/tenant").session(session).with(grace()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"south\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/bff/user").session(session).with(grace())).andExpect(content().json("{\"currentTenant\":\"south\"}"));
        // The services receive the tenant of the session, not the one of the browser.
        mvc.perform(get("/registry/apps").session(session).with(grace()).header("X-Tenant", "north")).andExpect(status().isOk());
        assertThat(received.getFirst().headers().get("X-tenant")).containsExactly("south");

        // A new session starts on the last tenant chosen.
        mvc.perform(get("/bff/user").session(new MockHttpSession()).with(grace())).andExpect(content().json("{\"currentTenant\":\"south\"}"));
    }

    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void onlyTheTenantsOfferedToTheUserCanBeChosen() throws Exception {
        mvc.perform(post("/bff/tenant").with(grace()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"west\"}"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mvc.perform(post("/bff/tenant").with(grace()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/bff/tenant").with(grace()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("not json"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        // A user without tenants: nothing to choose, nothing in the user, nothing forwarded.
        mvc.perform(post("/bff/tenant").with(oidcLogin()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"north\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/registry/apps").with(oauth2Login()).header("X-Tenant", "north")).andExpect(status().isOk());
        assertThat(received.getFirst().headers()).doesNotContainKey("X-tenant");
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor grace() {
        return oidcLogin().idToken(t -> t.claim("preferred_username", "grace"));
    }
}
