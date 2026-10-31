package it.lowcode.reference.bff;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Switch of the tenant of the session (contracts/bff.yaml, {@code POST /bff/tenant}). A POST with the CSRF token,
 * never a GET: a link from another site cannot switch it.
 */
@RestController
public class TenantController {

    public record TenantSelection(String tenant) {}

    private final Tenants tenants;

    public TenantController(Tenants tenants) {
        this.tenants = tenants;
    }

    @PostMapping("/bff/tenant")
    public void select(@RequestBody TenantSelection body, Authentication user, HttpServletRequest request, HttpServletResponse response)
            throws IOException {
        if (body.tenant() == null || body.tenant().isBlank()) {
            ApiForwardingFilter.problem(response, HttpStatus.BAD_REQUEST, "Tenant missing");
        } else if (!tenants.select(request.getSession(), Tenants.username(user), body.tenant())) {
            ApiForwardingFilter.problem(response, HttpStatus.NOT_FOUND, "Tenant not offered to the user");
        } else {
            response.setStatus(HttpStatus.NO_CONTENT.value());
        }
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    void unreadable(HttpServletResponse response) throws IOException {
        ApiForwardingFilter.problem(response, HttpStatus.BAD_REQUEST, "Invalid body");
    }
}
