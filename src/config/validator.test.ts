import { describe, it, expect } from "vitest";
import {
  ConfigValidationError,
  parseSentinelConfig,
  parseUpstreamConfig,
} from "./validator.js";

describe("Config Validator", () => {
  describe("parseUpstreamConfig", () => {
    it("successfully parses a valid stdio upstream config", () => {
      const validStdio = {
        id: "local_fs",
        name: "Local Filesystem Server",
        transport: "stdio",
        command: "node",
        args: ["./fs-server.js"],
        env: { LOG_LEVEL: "debug" },
      };

      const parsed = parseUpstreamConfig(validStdio);
      expect(parsed.id).toBe("local_fs");
      expect(parsed.transport).toBe("stdio");
      if (parsed.transport === "stdio") {
        expect(parsed.command).toBe("node");
        expect(parsed.args).toEqual(["./fs-server.js"]);
      }
      expect(parsed.enabled).toBe(true);
      expect(parsed.timeoutMs).toBe(30000);
    });

    it("successfully parses a valid streamable-http upstream config", () => {
      const validHttp = {
        id: "remote_api",
        name: "Remote API Server",
        transport: "streamable-http",
        url: "https://api.example.com/mcp",
        headers: { Authorization: "Bearer token123" },
      };

      const parsed = parseUpstreamConfig(validHttp);
      expect(parsed.id).toBe("remote_api");
      expect(parsed.transport).toBe("streamable-http");
      if (parsed.transport === "streamable-http") {
        expect(parsed.url).toBe("https://api.example.com/mcp");
        expect(parsed.headers).toEqual({ Authorization: "Bearer token123" });
      }
      expect(parsed.enabled).toBe(true);
    });

    it("strictly rejects deprecated sse and http-sse transports", () => {
      const deprecatedSse = {
        id: "legacy_srv",
        name: "Legacy SSE",
        transport: "sse",
        url: "http://localhost:8000/sse",
      };

      expect(() => parseUpstreamConfig(deprecatedSse)).toThrow(
        ConfigValidationError
      );
      expect(() => parseUpstreamConfig(deprecatedSse)).toThrow(/deprecated/i);

      const deprecatedHttpSse = {
        id: "legacy_srv2",
        name: "Legacy HTTP SSE",
        transport: "http-sse",
        url: "http://localhost:8000/sse",
      };
      expect(() => parseUpstreamConfig(deprecatedHttpSse)).toThrow(/deprecated/i);
    });

    it("rejects invalid server IDs with special characters or spaces", () => {
      const invalidId = {
        id: "server id with spaces!",
        name: "Invalid ID Server",
        transport: "stdio",
        command: "node",
      };
      expect(() => parseUpstreamConfig(invalidId)).toThrow(ConfigValidationError);
    });

    it("rejects invalid URLs for streamable-http", () => {
      const invalidUrl = {
        id: "bad_url_srv",
        name: "Bad URL Server",
        transport: "streamable-http",
        url: "not-a-valid-url",
      };
      expect(() => parseUpstreamConfig(invalidUrl)).toThrow(ConfigValidationError);
    });
  });

  describe("parseSentinelConfig", () => {
    it("parses valid multi-upstream config", () => {
      const raw = {
        name: "test-sentinel",
        version: "1.0.0",
        upstreams: [
          {
            id: "fs",
            name: "Filesystem",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
          },
          {
            id: "web",
            name: "Web Service",
            transport: "streamable-http",
            url: "https://example.com/mcp",
          },
        ],
      };

      const parsed = parseSentinelConfig(raw);
      expect(parsed.name).toBe("test-sentinel");
      expect(parsed.upstreams).toHaveLength(2);
      expect(parsed.upstreams[0].id).toBe("fs");
      expect(parsed.upstreams[1].id).toBe("web");
    });

    it("rejects configurations with duplicate server IDs", () => {
      const duplicateConfig = {
        upstreams: [
          {
            id: "same_id",
            name: "First",
            transport: "stdio",
            command: "echo",
          },
          {
            id: "same_id",
            name: "Second",
            transport: "streamable-http",
            url: "https://example.com/mcp",
          },
        ],
      };

      expect(() => parseSentinelConfig(duplicateConfig)).toThrow(
        /Duplicate upstream server ID/i
      );
    });
  });
});
