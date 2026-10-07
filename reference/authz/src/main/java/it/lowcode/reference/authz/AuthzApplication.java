package it.lowcode.reference.authz;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AuthzApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthzApplication.class, args);
    }
}
