import { describe, it, expect } from "vitest";
import {
  isSensitiveKey,
  redactString,
  redactData,
  summarizePayload,
  REDACTED_VALUE,
} from "./redact.js";

describe("Redaction Engine", () => {
  it("identifies sensitive keys accurately", () => {
    expect(isSensitiveKey("apiKey")).toBe(true);
    expect(isSensitiveKey("api_key")).toBe(true);
    expect(isSensitiveKey("authToken")).toBe(true);
    expect(isSensitiveKey("client_secret")).toBe(true);
    expect(isSensitiveKey("password")).toBe(true);
    expect(isSensitiveKey("session_cookie")).toBe(true);
    expect(isSensitiveKey("username")).toBe(false);
    expect(isSensitiveKey("query")).toBe(false);
  });

  it("redacts sensitive strings in inline text", () => {
    const bearerText = "Authorization: Bearer my-secret-jwt-token-12345 in header";
    expect(redactString(bearerText)).toBe("Authorization: Bearer [REDACTED] in header");

    const apiKeyText = "Connecting with sk-1234567890abcdef1234567890 to API";
    expect(redactString(apiKeyText)).toBe("Connecting with [REDACTED_KEY] to API");
  });

  it("deeply redacts nested objects with sensitive fields", () => {
    const sensitivePayload = {
      user: "alice",
      token: "secret-token-value",
      config: {
        dbPassword: "supersecretpassword",
        host: "localhost",
        headers: {
          authorization: "Bearer 987654321",
        },
      },
      tags: ["admin", "prod"],
    };

    const redacted = redactData(sensitivePayload);
    expect(redacted.user).toBe("alice");
    expect(redacted.token).toBe(REDACTED_VALUE);
    expect(redacted.config.dbPassword).toBe(REDACTED_VALUE);
    expect(redacted.config.host).toBe("localhost");
    expect(redacted.config.headers.authorization).toBe(REDACTED_VALUE);
    expect(redacted.tags).toEqual(["admin", "prod"]);
  });

  it("handles circular references gracefully without stack overflow", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;

    const result = redactData(circular);
    expect(result.name).toBe("loop");
    expect(result.self).toBe("[CIRCULAR]");
  });

  it("summarizes payloads without exposing raw secrets", () => {
    const payload = {
      sqlQuery: "SELECT * FROM users",
      apiKey: "sk-abcdef1234567890abcdef1234",
    };

    const summary = summarizePayload(payload);
    expect(summary.type).toBe("object");
    expect(summary.keys).toEqual(["sqlQuery", "apiKey"]);
    expect(summary.sizeBytes).toBeGreaterThan(0);
    expect((summary.redactedPreview as Record<string, unknown>).apiKey).toBe(
      REDACTED_VALUE
    );
  });
});
