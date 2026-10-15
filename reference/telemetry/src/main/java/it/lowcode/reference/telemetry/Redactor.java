package it.lowcode.reference.telemetry;

import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Second redaction of recognisable personal data (the first one happens in the runtime, on "sensitive" fields). */
@Component
public class Redactor {

    static final String MASK = "[REDACTED]";

    private static final Pattern IBAN = Pattern.compile("\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b");
    private static final Pattern ITALIAN_TAX_CODE = Pattern.compile("\\b[A-Z]{6}\\d{2}[A-Z]\\d{2}[A-Z]\\d{3}[A-Z]\\b");

    public String redact(String payload) {
        String result = IBAN.matcher(payload).replaceAll(MASK);
        return ITALIAN_TAX_CODE.matcher(result).replaceAll(MASK);
    }
}
