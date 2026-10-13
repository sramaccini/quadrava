package it.lowcode.reference.registry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.Filter;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

/** Il contratto registry.yaml 0.3 dal lato HTTP: validazione, modifiche concorrenti, revisione, ambienti protetti. */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RegistryApiTest {

    private static final String BASE = "/registry/apps/demo/documents/screen/fatture-elenco";
    private static final String VALID = """
            {"schemaVersion":"1.0","screen":"fatture-elenco","components":[{"type":"text","text":"Fatture"}]}""";

    @Autowired
    WebApplicationContext context;

    @Autowired
    @Qualifier("springSecurityFilterChain")
    Filter security;

    MockMvc mvc;
    final JsonMapper json = JsonMapper.builder().build();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    }

    private static RequestPostProcessor user(String name, String... roles) {
        return jwt().jwt(j -> j.subject(name).claim("preferred_username", name).claim("realm_access", Map.of("roles", List.of(roles))));
    }

    private String save(String content, RequestPostProcessor who) throws Exception {
        String body = mvc.perform(post(BASE + "/versions").with(who).contentType(MediaType.APPLICATION_JSON).content(content))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return (String) json.readValue(body, Map.class).get("hash");
    }

    private void review(String hash, String action, RequestPostProcessor who, int expected) throws Exception {
        mvc.perform(post(BASE + "/versions/" + hash + "/review").with(who).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"" + action + "\"}"))
                .andExpect(status().is(expected));
    }

    @Test
    void senzaTokenNonSiEntra() throws Exception {
        mvc.perform(get("/registry/apps")).andExpect(status().isUnauthorized());
    }

    @Test
    void unDocumentoFuoriSchemaSiRifiutaConLeIndicazioni() throws Exception {
        String invalid = """
                {"schemaVersion":"1.0","screen":"fatture-elenco","components":[{"type":"tabella"},{"type":"text"}]}""";
        mvc.perform(post(BASE + "/versions").with(user("mario", "operatore")).contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Il documento non rispetta lo schema"))
                .andExpect(jsonPath("$.errors[0].path").value(org.hamcrest.Matchers.startsWith("/components/")));
        // L'autore è il nome utente del token.
        mvc.perform(post(BASE + "/versions").with(user("mario", "operatore")).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author").value("mario"))
                .andExpect(jsonPath("$.state").value("bozza"));
    }

    @Test
    void identificativiNonValidiSiRifiutano() throws Exception {
        mvc.perform(post("/registry/apps/Demo_1/documents/screen/x/versions").with(user("mario")).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void conIfMatchIlSalvataggioRiesceSoloSullUltimaVersione() throws Exception {
        String first = save(VALID, user("mario", "operatore"));
        String second = VALID.replace("Fatture", "Fatture emesse");
        // Luisa salva partendo dalla prima versione: va bene.
        mvc.perform(post(BASE + "/versions").with(user("luisa", "operatore")).header("If-Match", "\"" + first + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(second))
                .andExpect(status().isCreated());
        // Mario salva ancora partendo dalla prima: qualcuno ha salvato nel frattempo.
        mvc.perform(post(BASE + "/versions").with(user("mario", "operatore")).header("If-Match", "\"" + first + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID.replace("Fatture", "Fatture ricevute")))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.latestAuthor").value("luisa"));
    }

    @Test
    void revisioneConQuattroOcchiEAmbientiProtetti() throws Exception {
        String hash = save(VALID, user("mario", "operatore"));
        String publish = "{\"hash\":\"" + hash + "\"}";
        // In sviluppo si pubblica sempre; in produzione solo una versione approvata.
        mvc.perform(put(BASE + "/published").param("env", "sviluppo").with(user("mario", "operatore")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isNoContent());
        mvc.perform(put(BASE + "/published").param("env", "produzione").with(user("mario", "operatore")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isConflict());

        review(hash, "richiedi", user("mario", "operatore"), 200);
        // Un operatore non approva; l'autore nemmeno se è responsabile.
        review(hash, "approva", user("anna", "operatore"), 403);
        review(hash, "approva", user("mario", "responsabile"), 403);
        review(hash, "approva", user("luisa", "responsabile"), 200);
        review(hash, "approva", user("luisa", "responsabile"), 409);

        mvc.perform(put(BASE + "/published").param("env", "produzione").with(user("mario", "operatore")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isNoContent());
        String versions = mvc.perform(get(BASE + "/versions").with(user("mario")))
                .andExpect(jsonPath("$[0].state").value("approvata"))
                .andExpect(jsonPath("$[0].reviewedBy").value("luisa"))
                .andReturn().getResponse().getContentAsString();
        assertThat(versions).contains("reviewedAt");
    }
}
