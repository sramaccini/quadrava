package it.lowcode.reference.authz;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CapabilitiesServiceTest {

    private final CapabilitiesService service = new CapabilitiesService(new AuthzProperties(Map.of(
            "operator", List.of("ordini.ordine.leggi"),
            "manager", List.of("ordini.ordine.leggi", "ordini.ordine.approva"))));

    @Test
    void permissionsAreTheUnionOfTheRoles() {
        var caps = service.forRoles(List.of("operator", "manager"));
        assertThat(caps.permissions()).containsExactly("ordini.ordine.approva", "ordini.ordine.leggi");
    }

    @Test
    void unknownRoleGivesNoPermissions() {
        assertThat(service.forRoles(List.of("unknown")).permissions()).isEmpty();
    }

    @Test
    void theVersionChangesWhenThePermissionsChange() {
        var operator = service.forRoles(List.of("operator"));
        var manager = service.forRoles(List.of("manager"));
        assertThat(operator.version()).isNotEqualTo(manager.version());
    }

    @Test
    void checkFollowsThePermissions() {
        var request = new Model.CheckRequest(List.of(
                new Model.CheckItem("ordini.ordine.leggi", null),
                new Model.CheckItem("ordini.ordine.approva", null)));
        var response = service.check(List.of("operator"), request);
        assertThat(response.results()).extracting(Model.CheckResult::allowed).containsExactly(true, false);
    }
}
