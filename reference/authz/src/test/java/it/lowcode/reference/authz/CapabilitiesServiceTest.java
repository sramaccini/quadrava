package it.lowcode.reference.authz;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CapabilitiesServiceTest {

    private final CapabilitiesService service = new CapabilitiesService(new AuthzProperties(Map.of(
            "operatore", List.of("ordini.ordine.leggi"),
            "responsabile", List.of("ordini.ordine.leggi", "ordini.ordine.approva"))));

    @Test
    void permessiSonoLaUnioneDeiRuoli() {
        var caps = service.forRoles(List.of("operatore", "responsabile"));
        assertThat(caps.permissions()).containsExactly("ordini.ordine.approva", "ordini.ordine.leggi");
    }

    @Test
    void ruoloSconosciutoNonDaPermessi() {
        assertThat(service.forRoles(List.of("sconosciuto")).permissions()).isEmpty();
    }

    @Test
    void laVersioneCambiaQuandoCambianoIPermessi() {
        var operatore = service.forRoles(List.of("operatore"));
        var responsabile = service.forRoles(List.of("responsabile"));
        assertThat(operatore.version()).isNotEqualTo(responsabile.version());
    }

    @Test
    void checkRispettaIPermessi() {
        var request = new Model.CheckRequest(List.of(
                new Model.CheckItem("ordini.ordine.leggi", null),
                new Model.CheckItem("ordini.ordine.approva", null)));
        var response = service.check(List.of("operatore"), request);
        assertThat(response.results()).extracting(Model.CheckResult::allowed).containsExactly(true, false);
    }
}
