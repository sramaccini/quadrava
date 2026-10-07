package it.lowcode.reference.telemetry;

import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Seconda redazione dei dati personali riconoscibili (la prima avviene nel runtime, sui campi "sensitive"). */
@Component
public class Redactor {

    static final String MASK = "[REDATTO]";

    private static final Pattern IBAN = Pattern.compile("\\b[A-Z]{2}\\d{2}[A-Z0-9]{11,30}\\b");
    private static final Pattern CODICE_FISCALE = Pattern.compile("\\b[A-Z]{6}\\d{2}[A-Z]\\d{2}[A-Z]\\d{3}[A-Z]\\b");

    public String redact(String payload) {
        String result = IBAN.matcher(payload).replaceAll(MASK);
        return CODICE_FISCALE.matcher(result).replaceAll(MASK);
    }
}
