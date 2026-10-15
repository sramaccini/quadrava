package it.lowcode.reference.telemetry;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RedactorTest {

    private final Redactor redactor = new Redactor();

    @Test
    void redactsIban() {
        String out = redactor.redact("{\"msg\":\"IBAN IT60X0542811101000000123456 wrong\"}");
        assertThat(out).doesNotContain("IT60X0542811101000000123456").contains(Redactor.MASK);
    }

    @Test
    void redactsItalianTaxCode() {
        String out = redactor.redact("customer RSSMRA80A01H501U");
        assertThat(out).isEqualTo("customer " + Redactor.MASK);
    }

    @Test
    void leavesNeutralTextAlone() {
        String text = "{\"event\":\"action.run\",\"screenId\":\"order-list\"}";
        assertThat(redactor.redact(text)).isEqualTo(text);
    }
}
