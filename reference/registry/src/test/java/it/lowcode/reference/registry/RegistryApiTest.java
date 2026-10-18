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
 * The registry.yaml 0.5 contract over HTTP: validation, concurrent changes, review, protected environments,
 * cross-document references.
 */
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RegistryApiTest {

    private static final String BASE = "/registry/apps/demo/documents/screen/invoice-list";
    private static final String VALID = """
            {"schemaVersion":"1.0","screen":"invoice-list","components":[{"type":"text","text":"Fatture"}]}""";

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
    void withoutATokenThereIsNoAccess() throws Exception {
        mvc.perform(get("/registry/apps")).andExpect(status().isUnauthorized());
    }

    @Test
    void aDocumentNotMatchingTheSchemaIsRejectedWithDetails() throws Exception {
        String invalid = """
                {"schemaVersion":"1.0","screen":"invoice-list","components":[{"type":"table"},{"type":"text"}]}""";
        mvc.perform(post(BASE + "/versions").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(invalid))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("The document does not match the schema"))
                .andExpect(jsonPath("$.errors[0].path").value(org.hamcrest.Matchers.startsWith("/components/")));
        // The author is the user name of the token.
        mvc.perform(post(BASE + "/versions").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author").value("mario"))
                .andExpect(jsonPath("$.state").value("draft"));
    }

    @Test
    void invalidIdentifiersAreRejected() throws Exception {
        mvc.perform(post("/registry/apps/Demo_1/documents/screen/x/versions").with(user("mario")).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isBadRequest());
    }

    @Test
    void withIfMatchTheSaveSucceedsOnlyOnTheLatestVersion() throws Exception {
        String first = save(VALID, user("mario", "operator"));
        String second = VALID.replace("Fatture", "Fatture emesse");
        // Luisa saves starting from the first version: fine.
        mvc.perform(post(BASE + "/versions").with(user("luisa", "operator")).header("If-Match", "\"" + first + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(second))
                .andExpect(status().isCreated());
        // Mario saves again starting from the first one: someone saved in the meantime.
        mvc.perform(post(BASE + "/versions").with(user("mario", "operator")).header("If-Match", "\"" + first + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content(VALID.replace("Fatture", "Fatture ricevute")))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.latestAuthor").value("luisa"));
    }

    @Test
    void fourEyesReviewAndProtectedEnvironments() throws Exception {
        String hash = save(VALID, user("mario", "operator"));
        String publish = "{\"hash\":\"" + hash + "\"}";
        // In development anything is published; in production only an approved version.
        mvc.perform(put(BASE + "/published").param("env", "development").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isNoContent());
        mvc.perform(put(BASE + "/published").param("env", "production").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON).content(publish))
                .andExpect(status().isConflict());

        review(hash, "request", user("mario", "operator"), 200);
        // An operator does not approve; nor does the author, even as a manager.
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
    void aNavigationIsPublishedInProductionOnlyWithItsScreens() throws Exception {
        String nav = "/registry/apps/demo/documents/navigation/principale";
        String navigation = """
                {"schemaVersion":"1.0","navigation":"principale","areas":[{"id":"invoices","label":"Fatture","items":[
                  {"id":"list","label":"List","screen":"invoice-list"},{"id":"new","label":"New","screen":"invoice-new"}]}]}""";
        String navHash = (String) json.readValue(mvc.perform(post(nav + "/versions").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content(navigation))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), Map.class).get("hash");
        String screenHash = save(VALID, user("mario", "operator"));

        // Without an environment: the screen that does not exist in the registry is missing.
        mvc.perform(get(nav + "/versions/" + navHash + "/references").with(user("mario")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.env").doesNotExist())
                .andExpect(jsonPath("$.references.length()").value(2))
                .andExpect(jsonPath("$.missing.length()").value(1))
                .andExpect(jsonPath("$.missing[0].screen").value("invoice-new"))
                .andExpect(jsonPath("$.missing[0].path").value("/areas/0/items/1/screen"));
        // In development neither is published, but the navigation is published anyway.
        mvc.perform(get(nav + "/versions/" + navHash + "/references").param("env", "development").with(user("mario")))
                .andExpect(jsonPath("$.env").value("development"))
                .andExpect(jsonPath("$.missing.length()").value(2));
        mvc.perform(put(nav + "/published").param("env", "development").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + navHash + "\"}"))
                .andExpect(status().isNoContent());

        // In production, approved, it is rejected until the screens are there.
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
                .andExpect(jsonPath("$.missingReferences[0].screen").value("invoice-new"));

        // Version not found or invalid environment.
        mvc.perform(get(nav + "/versions/inesistente/references").with(user("mario"))).andExpect(status().isNotFound());
        mvc.perform(get(nav + "/versions/" + navHash + "/references").param("env", "Prod!").with(user("mario"))).andExpect(status().isBadRequest());
    }

    @Test
    void aScreenIsPublishedInProductionOnlyWithItsDataSources() throws Exception {
        String sources = "/registry/apps/demo/documents/datasources/invoices";
        String document = """
                {"schemaVersion":"1.0","datasources":"invoices","sources":{"list":{"type":"rest","method":"GET","url":"/api/invoices"}}}""";
        String screen = """
                {"schemaVersion":"1.0","screen":"invoice-list","dataSources":{"invoices":{"ref":"invoices/list"}},
                 "components":[{"type":"table","source":"invoices","columns":[{"field":"number"}]}]}""";
        String screenHash = save(screen, user("mario", "operator"));
        // The data sources document is validated against its schema (which uses the data source of the screen schema).
        mvc.perform(post(sources + "/versions").with(user("mario", "operator")).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"schemaVersion\":\"1.0\",\"datasources\":\"invoices\",\"sources\":{\"list\":{\"url\":\"/api\"}}}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get(BASE + "/versions/" + screenHash + "/references").with(user("mario")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dataSources.length()").value(1))
                .andExpect(jsonPath("$.dataSources[0].datasources").value("invoices"))
                .andExpect(jsonPath("$.dataSources[0].path").value("/dataSources/invoices/ref"))
                .andExpect(jsonPath("$.missingDataSources.length()").value(1));
        review(screenHash, "request", user("mario", "operator"), 200);
        review(screenHash, "approve", user("luisa", "manager"), 200);
        mvc.perform(put(BASE + "/published").param("env", "production").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + screenHash + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.missingDataSources[0].datasources").value("invoices"));

        // Once the data sources are approved and published there, the screen is published too.
        String sourcesHash = (String) json.readValue(mvc.perform(post(sources + "/versions").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content(document))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), Map.class).get("hash");
        for (String[] step : new String[][] {{"request", "mario", "operator"}, {"approve", "luisa", "manager"}}) {
            mvc.perform(post(sources + "/versions/" + sourcesHash + "/review").with(user(step[1], step[2]))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"" + step[0] + "\"}")).andExpect(status().isOk());
        }
        mvc.perform(put(sources + "/published").param("env", "production").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + sourcesHash + "\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(put(BASE + "/published").param("env", "production").with(user("mario", "operator"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"hash\":\"" + screenHash + "\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get(sources + "/published").param("env", "production").with(user("mario")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sources.list.url").value("/api/invoices"));
    }
}
