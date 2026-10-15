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
 * Inoltro delle API, sicurezza delle chiamate delle applicazioni e login con ritorno. Il servizio a valle è un server
 * HTTP finto che registra le richieste; il token d'accesso è finto (Keycloak non serve).
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
            exchange.getResponseHeaders().add("Set-Cookie", "interno=1");
            exchange.getResponseHeaders().add("X-Interno", "segreto");
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
        // Un servizio spento: nessuno ascolta su questa porta.
        registry.add("lowcode.bff.routes[1].prefix", () -> "/spento");
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
            return (user, request, response) -> Optional.of("token-di-prova");
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
        // Prima la sicurezza, poi l'inoltro: come nel server vero.
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security, forwarding).build();
    }

    @Test
    void senzaSessioneLeApiRispondono401ElePagineMandanoAlLogin() throws Exception {
        mvc.perform(get("/registry/apps")).andExpect(status().isUnauthorized());
        mvc.perform(get("/bff/user")).andExpect(status().isUnauthorized());
        // Un browser che chiede una pagina (Accept: text/html) va al login.
        mvc.perform(get("/una-pagina").accept(MediaType.TEXT_HTML)).andExpect(status().is3xxRedirection());
        assertThat(received).isEmpty();
    }

    @Test
    void inoltraConIlTokenDellaSessioneSenzaCookieERestituisceSoloIntestazioniSicure() throws Exception {
        mvc.perform(get("/registry/apps/demo/documents/screen/ordini-elenco/published").queryParam("env", "production")
                        .with(oauth2Login())
                        .header("traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
                        .header("Authorization", "Bearer dal-browser")
                        .cookie(new Cookie("JSESSIONID", "sessione")))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"ok\":true}"))
                .andExpect(header().string("ETag", "\"v1\""))
                // I cookie del servizio non arrivano al browser (quello del CSRF è del BFF).
                .andExpect(cookie().doesNotExist("interno"))
                .andExpect(header().doesNotExist("X-Interno"));
        assertThat(received).hasSize(1);
        Received r = received.getFirst();
        assertThat(r.uri()).isEqualTo("/registry/apps/demo/documents/screen/ordini-elenco/published?env=production");
        assertThat(r.headers().get("Authorization")).containsExactly("Bearer token-di-prova");
        assertThat(r.headers().get("Traceparent")).containsExactly("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
        assertThat(r.headers()).doesNotContainKey("Cookie");
    }

    @Test
    void ilCookieCsrfArrivaGiaConLaPrimaRisposta() throws Exception {
        mvc.perform(get("/registry/apps").with(oauth2Login()))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false));
    }

    @Test
    // csrf() di spring-security-test sostituisce per sempre il repository dei token nel filtro condiviso: dopo questo
    // test si riparte da un contesto pulito.
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.AFTER_METHOD)
    void leScrittureRichiedonoIlTokenCsrf() throws Exception {
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
    void servizioSpentoEPercorsiStraniNonPassano() throws Exception {
        mvc.perform(get("/spento/qualcosa").with(oauth2Login()))
                .andExpect(status().isBadGateway())
                .andExpect(content().json("{\"title\":\"Servizio non raggiungibile\",\"status\":502}"));
        mvc.perform(get("/registry/%2e%2e/actuator/env").with(oauth2Login())).andExpect(status().isBadRequest());
        assertThat(received).isEmpty();
    }

    @Test
    void loginConRitornoSoloVersoLeApplicazioniConsentite() throws Exception {
        mvc.perform(get("/bff/login").queryParam("return", "http://localhost:4201/?anteprima"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/oauth2/authorization/keycloak"))
                .andExpect(request().sessionAttribute(LoginController.RETURN_ATTRIBUTE, "http://localhost:4201/?anteprima"));
        mvc.perform(get("/bff/login").queryParam("return", "https://altro.example/")).andExpect(status().isBadRequest());
        mvc.perform(get("/bff/login").queryParam("return", "http://utente@localhost:4201/")).andExpect(status().isBadRequest());
    }

    @Test
    void dopoIlLoginSiTornaAllaPaginaSalvata() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(LoginController.RETURN_ATTRIBUTE, "http://localhost:4201/");
        MockHttpServletResponse response = new MockHttpServletResponse();
        new LoginController.ReturnToFrontend(properties).onAuthenticationSuccess(request, response, null);
        assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:4201/");
        // Senza pagina salvata: la home delle applicazioni.
        MockHttpServletResponse other = new MockHttpServletResponse();
        new LoginController.ReturnToFrontend(properties).onAuthenticationSuccess(new MockHttpServletRequest(), other, null);
        assertThat(other.getRedirectedUrl()).isEqualTo("http://localhost:4200/");
    }

    @Test
    void uscireChiudeAncheLaSessioneDiKeycloak() throws Exception {
        mvc.perform(post("/logout").with(oidcLogin()).with(csrf()))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl())
                        .startsWith("http://idp.test/logout?id_token_hint=")
                        .endsWith("&post_logout_redirect_uri=http%3A%2F%2Flocalhost%2F"));
        mvc.perform(get("/").with(oidcLogin())).andExpect(redirectedUrl("http://localhost:4200/"));
        // Dalle applicazioni: una chiamata JSON, che riceve l'indirizzo dove andare.
        mvc.perform(post("/logout").with(oidcLogin()).with(csrf()).accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(result -> assertThat(result.getResponse().getContentAsString()).startsWith("{\"redirect\":\"http://idp.test/logout?id_token_hint="));
    }
}
