package com.logicwarez.quadrava.reference.bff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.logicwarez.authz.session.AuthorizationResolver;
import com.logicwarez.authz.session.SessionContext;
import com.logicwarez.authz.session.UserNotAuthorizedException;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.Filter;
import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.session.MapSessionRepository;
import org.springframework.session.config.annotation.web.http.EnableSpringHttpSession;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * API forwarding, security of the applications' calls, login with return, tenants and permissions of the configuration.
 * The downstream service is a fake HTTP server that records the requests and also publishes the discovery document of a
 * fake Keycloak; the sessions are in memory and opened by the tests with the context the login would store (no Keycloak
 * and no Redis needed); the access token is fake.
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
        // Discovery of the fake identity provider: the BFF reads it at start-up (logout address, keys).
        upstream.createContext("/realms/test/.well-known/openid-configuration", exchange -> {
            String issuer = "http://localhost:" + upstream.getAddress().getPort() + "/realms/test";
            byte[] reply = ("{\"issuer\":\"" + issuer + "\",\"authorization_endpoint\":\"" + issuer + "/auth\","
                    + "\"token_endpoint\":\"" + issuer + "/token\",\"jwks_uri\":\"" + issuer + "/certs\","
                    + "\"end_session_endpoint\":\"" + issuer + "/logout\",\"response_types_supported\":[\"code\"],"
                    + "\"subject_types_supported\":[\"public\"],\"id_token_signing_alg_values_supported\":[\"RS256\"]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, reply.length);
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
        registry.add("KEYCLOAK_ISSUER_URI", () -> "http://localhost:" + upstream.getAddress().getPort() + "/realms/test");
        registry.add("quadrava.bff.routes[0].prefix", () -> "/registry");
        registry.add("quadrava.bff.routes[0].target", () -> "http://localhost:" + upstream.getAddress().getPort());
        // A service that is down: nobody listens on this port.
        registry.add("quadrava.bff.routes[1].prefix", () -> "/down");
        registry.add("quadrava.bff.routes[1].target", () -> "http://localhost:1");
        registry.add("quadrava.bff.users.ada", () -> "user,operator");
        // Two operational roles (ADR-28): grace works as one of them at a time.
        registry.add("quadrava.bff.users.grace", () -> "user,operator,manager");
        // Two tenants for grace only: the other users have none.
        registry.add("quadrava.bff.tenants[0].id", () -> "north");
        registry.add("quadrava.bff.tenants[0].label", () -> "North office");
        registry.add("quadrava.bff.tenants[0].users[0]", () -> "grace");
        registry.add("quadrava.bff.tenants[1].id", () -> "south");
        registry.add("quadrava.bff.tenants[1].label", () -> "South office");
        registry.add("quadrava.bff.tenants[1].users[0]", () -> "grace");
        // Its counter is in Redis, which the tests do not start.
        registry.add("authz.bff.login-rate-limit.enabled", () -> "false");
    }

    @TestConfiguration
    @EnableSpringHttpSession
    static class InMemory {
        @Bean
        MapSessionRepository sessionRepository() {
            return new MapSessionRepository(new java.util.concurrent.ConcurrentHashMap<>());
        }

        @Bean
        @Primary
        AccessTokens fakeAccessTokens() {
            return (request, response) -> Optional.of("test-token");
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
    AuthorizationResolver resolver;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        received.clear();
        // Security first, then forwarding: as in the real server.
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security, forwarding).build();
    }

    /** A session as the login of authz-library leaves it, with what the configuration gives the user. */
    MockHttpSession signedIn(String username) {
        AuthorizationResolver.Resolved r = resolver.resolve(username, null);
        MockHttpSession session = new MockHttpSession();
        Instant now = Instant.now();
        session.setAttribute(SessionContext.ATTRIBUTE, new SessionContext(r.username(), "Ada Lovelace", r.email(), r.tenantId(),
                r.tenants(), r.roles(), r.permissions(), now, now.plusSeconds(3600), r.operationalRoles(), r.currentRole()));
        return session;
    }

    @Test
    void withoutASessionEverythingAnswers401NeverARedirect() throws Exception {
        mvc.perform(get("/registry/apps")).andExpect(status().isUnauthorized());
        mvc.perform(get("/bff/user")).andExpect(status().isUnauthorized());
        mvc.perform(get("/a-page").accept(MediaType.TEXT_HTML)).andExpect(status().isUnauthorized());
        assertThat(received).isEmpty();
    }

    @Test
    void forwardsWithTheSessionTokenWithoutCookiesAndReturnsOnlySafeHeaders() throws Exception {
        MockHttpSession session = signedIn("ada");
        String version = SessionContext.from(session).orElseThrow().permissionsVersion();
        mvc.perform(get("/registry/apps/demo/documents/screen/order-list/published").queryParam("env", "production")
                        .session(session)
                        .header("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
                        .header("baggage", "lc.screen=order-list,lc.action=call%20approve")
                        .header("Authorization", "Bearer from-the-browser")
                        .cookie(new Cookie("JSESSIONID", "session")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"ok\":true}"))
                .andExpect(header().string("ETag", "\"v1\""))
                // The version of the permissions of the session, not the one of the service: otherwise the runtime
                // would reload the permissions after every call.
                .andExpect(header().string("X-Permissions-Version", version))
                // The service's cookies do not reach the browser (the CSRF one belongs to the BFF).
                .andExpect(cookie().doesNotExist("internal"))
                .andExpect(header().doesNotExist("X-Internal"));
        assertThat(received).hasSize(1);
        Received r = received.getFirst();
        assertThat(r.uri()).isEqualTo("/registry/apps/demo/documents/screen/order-list/published?env=production");
        assertThat(r.headers().get("Authorization")).containsExactly("Bearer test-token");
        assertThat(r.headers().get("Traceparent")).containsExactly("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
        assertThat(r.headers().get("Baggage")).containsExactly("lc.screen=order-list,lc.action=call%20approve");
        assertThat(r.headers()).doesNotContainKey("Cookie");
    }

    @Test
    void eventStreamsPassWithTheTokenAndTheirType() throws Exception {
        mvc.perform(get("/registry/events").session(signedIn("ada")).accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "text/event-stream"))
                .andExpect(content().string("event: tasks.changed\ndata: {}\n\nevent: comments.added\ndata: {}\n\n"));
        assertThat(received.getFirst().headers().get("Authorization")).containsExactly("Bearer test-token");
    }

    @Test
    void theUserOfTheSessionHasItsRolesAndNoTokensNorEmptyFields() throws Exception {
        mvc.perform(get("/bff/user").session(signedIn("ada")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"name\":\"Ada Lovelace\",\"username\":\"ada\",\"roles\":[\"user\",\"operator\"],\"operationalRoles\":[{\"id\":\"operator\",\"label\":\"Operator\"}],\"currentRole\":\"operator\"}",
                        org.springframework.test.json.JsonCompareMode.STRICT));
    }

    @Test
    void thePermissionsAreThoseOfTheRolesOfTheConfiguration() throws Exception {
        mvc.perform(get("/authz/capabilities").queryParam("app", "demo").session(signedIn("ada")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"permissions\":[\"invoices.invoice.create\",\"invoices.invoice.read\",\"orders.order.read\",\"showcase.components.read\"]}"));
        // The base roles add up with the active operational role only (ADR-28): grace starts as operator.
        assertThat(resolver.resolve("grace", null).permissions()).contains("showcase.components.read", "invoices.invoice.create")
                .doesNotContain("orders.order.approve");
        assertThat(resolver.resolve("grace", null, "manager").permissions()).contains("showcase.components.read", "orders.order.approve");
        // A user who is not in the configuration cannot sign in.
        assertThatThrownBy(() -> resolver.resolve("mallory", null)).isInstanceOf(UserNotAuthorizedException.class);
        // The services behind the routes are not asked: the permissions are answered by the BFF.
        assertThat(received).isEmpty();
    }

    @Test
    void theCsrfCookieArrivesWithTheFirstResponse() throws Exception {
        mvc.perform(get("/registry/apps").session(signedIn("ada")))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    // csrf() of spring-security-test replaces the token repository in the shared filter for good: after this test a
    // clean context is used.
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void writesRequireTheCsrfTokenAndAnOriginOfTheApplications() throws Exception {
        String doc = "{\"schemaVersion\":\"1.0\",\"screen\":\"order-list\"}";
        MockHttpSession session = signedIn("ada");
        mvc.perform(post("/registry/apps/demo/documents/screen/order-list/versions").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content(doc))
                .andExpect(status().isForbidden());
        mvc.perform(post("/registry/apps/demo/documents/screen/order-list/versions").session(session).with(csrf())
                        .header("Origin", "https://evil.example").contentType(MediaType.APPLICATION_JSON).content(doc))
                .andExpect(status().isForbidden());
        assertThat(received).isEmpty();
        mvc.perform(post("/registry/apps/demo/documents/screen/order-list/versions").session(session).with(csrf())
                        .header("Origin", "http://localhost:4201").contentType(MediaType.APPLICATION_JSON).content(doc))
                .andExpect(status().isCreated());
        assertThat(received.getFirst().method()).isEqualTo("POST");
        assertThat(received.getFirst().body()).isEqualTo(doc);
    }

    @Test
    void serviceDownAndOddPathsDoNotPass() throws Exception {
        MockHttpSession session = signedIn("ada");
        mvc.perform(get("/down/something").session(session))
                .andExpect(status().isBadGateway())
                .andExpect(content().json("{\"title\":\"Service unreachable\",\"status\":502}"));
        mvc.perform(get("/registry/%2e%2e/actuator/env").session(session)).andExpect(status().isBadRequest());
        assertThat(received).isEmpty();
    }

    @Test
    void loginReturnsOnlyToTheAllowedApplications() throws Exception {
        mvc.perform(get("/bff/login").queryParam("return", "http://localhost:4201/?preview"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/oauth2/authorization/keycloak"));
        mvc.perform(get("/bff/login").queryParam("return", "https://other.example/")).andExpect(status().isBadRequest());
        mvc.perform(get("/bff/login").queryParam("return", "http://user@localhost:4201/")).andExpect(status().isBadRequest());
    }

    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void signingOutAlsoClosesTheKeycloakSession() throws Exception {
        MockHttpSession session = signedIn("ada");
        mvc.perform(post("/logout").session(session).with(csrf()).accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString())
                        .startsWith("{\"redirect\":\"http://localhost:" + upstream.getAddress().getPort() + "/realms/test/logout?client_id=quadrava-bff")
                        .contains("post_logout_redirect_uri=http://localhost:4200/"));
        assertThat(session.isInvalid()).isTrue();
    }

    @Test
    void theBackChannelLogoutOfKeycloakNeedsNeitherASessionNorTheCsrfToken() throws Exception {
        // Without a logout token: refused by the endpoint itself, not by the security of the applications (401, 403).
        mvc.perform(post("/bff/backchannel-logout").contentType(MediaType.APPLICATION_FORM_URLENCODED))
                .andExpect(status().isBadRequest())
                .andExpect(content().json("{\"error\":\"invalid_request\"}"));
    }

    @Test
    // csrf() replaces the token repository for good (see writesRequireTheCsrfTokenAndAnOriginOfTheApplications).
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void theUserSwitchesTenantWithAPostAndTheNextSessionStartsOnTheLastOne() throws Exception {
        MockHttpSession session = signedIn("grace");
        mvc.perform(get("/bff/user").session(session))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"tenants\":[{\"id\":\"north\",\"label\":\"North office\"},{\"id\":\"south\",\"label\":\"South office\"}],\"currentTenant\":\"north\"}"));
        // Who may use a tenant stays in the BFF.
        mvc.perform(get("/bff/user").session(session))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).doesNotContain("users"));

        mvc.perform(post("/bff/tenant").session(session).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"south\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/bff/tenant").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"south\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/bff/user").session(session)).andExpect(content().json("{\"currentTenant\":\"south\"}"));
        // The services receive the tenant of the session, not the one of the browser.
        mvc.perform(get("/registry/apps").session(session).header("X-Tenant", "north")).andExpect(status().isOk());
        assertThat(received.getFirst().headers().get("X-tenant")).containsExactly("south");

        // A new session starts on the last tenant chosen.
        mvc.perform(get("/bff/user").session(signedIn("grace"))).andExpect(content().json("{\"currentTenant\":\"south\"}"));
    }

    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void onlyTheTenantsOfferedToTheUserCanBeChosen() throws Exception {
        MockHttpSession session = signedIn("grace");
        mvc.perform(post("/bff/tenant").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"west\"}"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mvc.perform(post("/bff/tenant").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/bff/tenant").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("not json"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        // A user without tenants: nothing to choose, nothing in the user, nothing forwarded.
        MockHttpSession ada = signedIn("ada");
        mvc.perform(post("/bff/tenant").session(ada).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"tenant\":\"north\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/registry/apps").session(ada).header("X-Tenant", "north")).andExpect(status().isOk());
        assertThat(received.getFirst().headers()).doesNotContainKey("X-tenant");
    }

    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void theUserSwitchesOperationalRoleAndTheServicesReceiveOnlyTheOneOfTheSession() throws Exception {
        MockHttpSession session = signedIn("grace");
        mvc.perform(get("/bff/user").session(session))
                .andExpect(content().json("{\"operationalRoles\":[{\"id\":\"operator\",\"label\":\"Operator\"},{\"id\":\"manager\",\"label\":\"Manager\"}],\"currentRole\":\"operator\"}"));
        mvc.perform(post("/bff/role").session(session).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"manager\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/bff/role").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"administrator\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/bff/role").session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"manager\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/authz/capabilities").queryParam("app", "demo").session(session))
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).contains("orders.order.approve"));
        // The services receive the role of the session, not the one of the browser.
        mvc.perform(get("/registry/apps").session(session).header("X-Active-Role", "administrator")).andExpect(status().isOk());
        assertThat(received.getFirst().headers().get("X-active-role")).containsExactly("manager");
        // A new session starts on the last role chosen.
        mvc.perform(get("/bff/user").session(signedIn("grace"))).andExpect(content().json("{\"currentRole\":\"manager\"}"));
    }
}
