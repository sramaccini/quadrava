package it.lowcode.reference.telemetry;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** The telemetry.yaml contract over HTTP: OTLP payloads accepted, errors in Problem format. */
@SpringBootTest(properties = "lowcode.telemetry.max-bytes=2000")
class TelemetryApiTest {

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

    private void send(String path, String body, int expected) throws Exception {
        mvc.perform(post(path).with(jwt()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().is(expected));
    }

    @Test
    void payloadsOfTheSignalAreAccepted() throws Exception {
        send("/telemetry/v1/traces", "{\"resourceSpans\":[]}", 202);
        send("/telemetry/v1/logs", "{\"resourceLogs\":[]}", 202);
        mvc.perform(post("/telemetry/v1/logs").contentType(MediaType.APPLICATION_JSON).content("{\"resourceLogs\":[]}")).andExpect(status().isUnauthorized());
    }

    @Test
    void invalidBodiesAreRejected() throws Exception {
        mvc.perform(post("/telemetry/v1/logs").with(jwt()).contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").exists());
        send("/telemetry/v1/traces", "{\"resourceLogs\":[]}", 400);
        send("/telemetry/v1/logs", "[1,2]", 400);
    }

    @Test
    void bodyOverTheLimit() throws Exception {
        mvc.perform(post("/telemetry/v1/logs").with(jwt()).contentType(MediaType.APPLICATION_JSON).content("{\"resourceLogs\":[\"" + "x".repeat(3000) + "\"]}"))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.status").value(413));
    }
}
