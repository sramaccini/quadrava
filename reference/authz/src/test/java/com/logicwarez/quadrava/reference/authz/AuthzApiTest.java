package com.logicwarez.quadrava.reference.authz;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** The authz.yaml contract over HTTP: capabilities, batch checks and their errors in Problem format. */
@SpringBootTest
class AuthzApiTest {

    @Autowired
    WebApplicationContext context;

    @Autowired
    @Qualifier("springSecurityFilterChain")
    Filter security;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    }

    private static RequestPostProcessor operator() {
        return jwt().jwt(j -> j.subject("operator").claim("realm_access", Map.of("roles", List.of("operator"))));
    }

    @Test
    void capabilitiesWithVersionInTheHeader() throws Exception {
        mvc.perform(get("/authz/capabilities").param("app", "demo").with(operator()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permissions[0]").exists())
                .andExpect(header().exists("X-Permissions-Version"));
        mvc.perform(get("/authz/capabilities").param("app", "demo")).andExpect(status().isUnauthorized());
    }

    @Test
    void missingAppParameterInProblemFormat() throws Exception {
        mvc.perform(get("/authz/capabilities").with(operator()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").exists());
    }

    @Test
    void invalidChecksAreRejected() throws Exception {
        String wrongFormat = "{\"checks\":[{\"permission\":\"Orders.Approve\"}]}";
        mvc.perform(post("/authz/check").with(operator()).contentType(MediaType.APPLICATION_JSON).content(wrongFormat))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").exists());
        mvc.perform(post("/authz/check").with(operator()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        String tooMany = "{\"checks\":[" + String.join(",", java.util.Collections.nCopies(AuthzController.MAX_CHECKS + 1, "{\"permission\":\"a.b.c\"}")) + "]}";
        mvc.perform(post("/authz/check").with(operator()).contentType(MediaType.APPLICATION_JSON).content(tooMany))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/authz/check").with(operator()).contentType(MediaType.APPLICATION_JSON).content("{\"checks\":[{\"permission\":\"invoices.invoice.read\"},{\"permission\":\"x.y.z\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].allowed").value(true))
                .andExpect(jsonPath("$.results[1].allowed").value(false));
    }
}
