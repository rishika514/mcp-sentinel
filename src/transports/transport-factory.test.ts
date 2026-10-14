import { describe, it, expect } from "vitest";
import { DefaultTransportFactory } from "./transport-factory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UpstreamConfig } from "../types/config.js";

describe("DefaultTransportFactory", () => {
  const factory = new DefaultTransportFactory();

  it("creates StdioClientTransport for stdio config", () => {
    const config: UpstreamConfig = {
      id: "local_tool",
      name: "Local Tool",
      transport: "stdio",
      command: "node",
      args: ["test.js"],
      env: { CUSTOM_VAR: "true" },
      enabled: true,
      timeoutMs: 5000,
    };

    const transport = factory.createTransport(config);
    expect(transport).toBeInstanceOf(StdioClientTransport);
  });

  it("creates StreamableHTTPClientTransport for streamable-http config", () => {
    const config: UpstreamConfig = {
      id: "remote_mcp",
      name: "Remote MCP",
      transport: "streamable-http",
      url: "https://mcp.internal.net/v1",
      headers: { "X-API-Key": "sentinel-key" },
      enabled: true,
      timeoutMs: 10000,
    };

    const transport = factory.createTransport(config);
    expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
  });
});
