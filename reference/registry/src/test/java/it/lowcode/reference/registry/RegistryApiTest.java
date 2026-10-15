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

/**
 * Il contratto registry.yaml 0.5 dal lato HTTP: validazione, modifiche concorrenti, revisione, ambienti protetti,
 * riferimenti tra documenti.
 */
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
        mvc.perform(post(BASE + "/versions").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Il documento non rispetta lo schema"))
                .andExpect(jsonPath("$.errors[0].path").value(org.hamcrest.Matchers.startsWith("/components/")));
        // L'autore è il nome utente del token.
        mvc.perform(post(BASE + "/versions").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author").value("mario"))
                .andExpect(jsonPath("$.state").value("draft"));
    }

    @Test
    void identificativiNonValidiSiRifiutano() throws Exception {
        mvc.perform(post("/registry/apps/Demo_1/documents/screen/x/versions").with(user("mario")).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void conIfMatchIlSalvataggioRiesceSoloSullUltimaVersione() throws Exception {
        String first = save(VALID, user("mario", "operator"));
        String second = VALID.replace("Fatture", "Fatture emesse");
        // Luisa salva partendo dalla prima versione: va bene.
        mvc.perform(post(BASE + "/versions").with(user("luisa", "operator")).header("If-Match", "\"" + first + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(second))
                .andExpect(status().isCreated());
        // Mario salva ancora partendo dalla prima: qualcuno ha salvato nel frattempo.
        mvc.perform(post(BASE + "/versions").with(user("mario", "operator")).header("If-Match", "\"" + first + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID.replace("Fatture", "Fatture ricevute")))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.latestAuthor").value("luisa"));
    }

    @Test
    void revisioneConQuattroOcchiEAmbientiProtetti() throws Exception {
        String hash = save(VALID, user("mario", "operator"));
        String publish = "{\"hash\":\"" + hash + "\"}";
        // In sviluppo si pubblica sempre; in produzione solo una versione approvata.
        mvc.perform(put(BASE + "/published").param("env", "development").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isNoContent());
        mvc.perform(put(BASE + "/published").param("env", "production").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isConflict());

        review(hash, "request", user("mario", "operator"), 200);
        // Un operatore non approva; l'autore nemmeno se è responsabile.
        review(hash, "approve", user("anna", "operator"), 403);
        review(hash, "approve", user("mario", "manager"), 403);
        review(hash, "approve", user("luisa", "manager"), 200);
        review(hash, "approve", user("luisa", "manager"), 409);

        mvc.perform(put(BASE + "/published").param("env", "production").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isNoContent());
        String versions = mvc.perform(get(BASE + "/versions").with(user("mario")))
                .andExpect(jsonPath("$[0].state").value("approved"))
                .andExpect(jsonPath("$[0].reviewedBy").value("luisa"))
                .andReturn().getResponse().getContentAsString();
        assertThat(versions).contains("reviewedAt");
    }

    @Test
    void unaNavigazioneSiPubblicaInProduzioneSoloConLeSueSchermate() throws Exception {
        String nav = "/registry/apps/demo/documents/navigation/principale";
        String navigation = """
                {"schemaVersion":"1.0","navigation":"principale","areas":[{"id":"fatture","label":"Fatture","items":[
                  {"id":"elenco","label":"Elenco","screen":"fatture-elenco"},{"id":"nuova","label":"Nuova","screen":"fattura-nuova"}]}]}""";
        String navHash = (String) json.readValue(mvc.perform(post(nav + "/versions").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content(navigation))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), Map.class).get("hash");
        String screenHash = save(VALID, user("mario", "operator"));

        // Senza ambiente: manca la schermata che nel registro non esiste.
        mvc.perform(get(nav + "/versions/" + navHash + "/references").with(user("mario")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.env").doesNotExist())
                .andExpect(jsonPath("$.references.length()").value(2))
                .andExpect(jsonPath("$.missing.length()").value(1))
                .andExpect(jsonPath("$.missing[0].screen").value("fattura-nuova"))
                .andExpect(jsonPath("$.missing[0].path").value("/areas/0/items/1/screen"));
        // In sviluppo nessuna delle due è pubblicata, ma la navigazione si pubblica lo stesso.
        mvc.perform(get(nav + "/versions/" + navHash + "/references").param("env", "development").with(user("mario")))
                .andExpect(jsonPath("$.env").value("development"))
                .andExpect(jsonPath("$.missing.length()").value(2));
        mvc.perform(put(nav + "/published").param("env", "development").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + navHash + "\"}"))
                .andExpect(status().isNoContent());

        // In produzione, approvata, si rifiuta finché le schermate non ci sono.
        mvc.perform(post(nav + "/versions/" + navHash + "/review").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"request\"}")).andExpect(status().isOk());
        mvc.perform(post(nav + "/versions/" + navHash + "/review").with(user("luisa", "manager")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"action\":\"approve\"}")).andExpect(status().isOk());
        review(screenHash, "request", user("mario", "operator"), 200);
        review(screenHash, "approve", user("luisa", "manager"), 200);
        mvc.perform(put(BASE + "/published").param("env", "production").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + screenHash + "\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(put(nav + "/published").param("env", "production").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + navHash + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.missingReferences.length()").value(1))
                .andExpect(jsonPath("$.missingReferences[0].screen").value("fattura-nuova"));

        // Versione inesistente o ambiente non valido.
        mvc.perform(get(nav + "/versions/inesistente/references").with(user("mario"))).andExpect(status().isNotFound());
        mvc.perform(get(nav + "/versions/" + navHash + "/references").param("env", "Prod!").with(user("mario"))).andExpect(status().isBadRequest());
    }
}
