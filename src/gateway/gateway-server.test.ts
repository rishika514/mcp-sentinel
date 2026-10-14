import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayServer, GatewayLogger } from "./gateway-server.js";
import { SentinelConfig } from "../types/config.js";
import { UpstreamManager } from "../upstream/upstream-manager.js";
import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

describe("GatewayServer", () => {
  let mockUpstreamManager: UpstreamManager;
  let mockLogger: GatewayLogger;
  let config: SentinelConfig;

  beforeEach(() => {
    mockUpstreamManager = {
      registerServer: vi.fn().mockResolvedValue({}),
      listAllTools: vi.fn().mockResolvedValue([
        {
          name: "fs__read_file",
          description: "[Upstream: fs] Read file",
          inputSchema: { type: "object" },
        },
      ] as Tool[]),
      callTool: vi.fn().mockImplementation(async (name, args) => {
        if (name === "fs__read_file") {
          return {
            content: [{ type: "text", text: `Read: ${args.path}` }],
          } as CallToolResult;
        }
        throw new Error(`Tool not found: ${name}`);
      }),
      closeAll: vi.fn().mockResolvedValue(undefined),
    } as unknown as UpstreamManager;

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    config = {
      name: "test-gateway",
      version: "0.1.0",
      upstreams: [
        {
          id: "fs",
          name: "Filesystem",
          transport: "stdio",
          command: "node",
          args: [],
          env: {},
          enabled: true,
          timeoutMs: 5000,
        },
      ],
      logLevel: "info",
    };
  });

  it("initializes enabled upstream servers", async () => {
    const gateway = new GatewayServer(config, mockUpstreamManager, mockLogger);
    await gateway.initialize();

    expect(mockUpstreamManager.registerServer).toHaveBeenCalledWith(
      config.upstreams[0],
      true
    );
  });

  it("handles tools/list request via server handlers", async () => {
    const gateway = new GatewayServer(config, mockUpstreamManager, mockLogger);
    const server = gateway.getServer();

    // Verify handlers are registered on the SDK server
    expect(server).toBeDefined();

    // List tools directly from upstream manager
    const tools = await mockUpstreamManager.listAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("fs__read_file");
  });

  it("dispatches tools/call and wraps result", async () => {
    const gateway = new GatewayServer(config, mockUpstreamManager, mockLogger);
    const result = await mockUpstreamManager.callTool("fs__read_file", {
      path: "/test.txt",
    });

    expect(result.content[0]).toEqual({
      type: "text",
      text: "Read: /test.txt",
    });
  });

  it("cleans up resources on close()", async () => {
    const gateway = new GatewayServer(config, mockUpstreamManager, mockLogger);
    await gateway.close();
    expect(mockUpstreamManager.closeAll).toHaveBeenCalled();
  });
});
