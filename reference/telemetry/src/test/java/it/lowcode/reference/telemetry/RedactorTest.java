package it.lowcode.reference.telemetry;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RedactorTest {

    private final Redactor redactor = new Redactor();

    @Test
    void redigeIban() {
        String out = redactor.redact("{\"msg\":\"IBAN IT60X0542811101000000123456 errato\"}");
        assertThat(out).doesNotContain("IT60X0542811101000000123456").contains(Redactor.MASK);
    }

    @Test
    void redigeCodiceFiscale() {
        String out = redactor.redact("cliente RSSMRA80A01H501U");
        assertThat(out).isEqualTo("cliente " + Redactor.MASK);
    }

    @Test
    void nonToccaTestoNeutro() {
        String text = "{\"event\":\"action.run\",\"screenId\":\"ordini-elenco\"}";
        assertThat(redactor.redact(text)).isEqualTo(text);
    }
}
