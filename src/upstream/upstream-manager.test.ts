import { describe, it, expect, vi, beforeEach } from "vitest";
import { UpstreamManager } from "./upstream-manager.js";
import { UpstreamConfig } from "../types/config.js";
import { ITransportFactory } from "../transports/transport-factory.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

// Mock the Client class from @modelcontextprotocol/sdk/client/index.js
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  class MockClient {
    private isFs: boolean;
    constructor(public info: { name: string; version: string }) {
      this.isFs = info.name.includes("fs_server");
    }

    async connect(): Promise<void> {}

    async listTools(): Promise<{ tools: Tool[] }> {
      if (this.isFs) {
        return {
          tools: [
            {
              name: "read_file",
              description: "Read file contents",
              inputSchema: {
                type: "object",
                properties: { path: { type: "string" } },
              },
            },
          ],
        };
      }

      return {
        tools: [
          {
            name: "execute_query",
            description: "Execute SQL query",
            inputSchema: {
              type: "object",
              properties: { sql: { type: "string" } },
            },
          },
        ],
      };
    }

    async callTool(params: { name: string; arguments?: Record<string, unknown> }) {
      return {
        content: [
          {
            type: "text",
            text: `Result from ${this.info.name} for ${params.name}`,
          },
        ],
      };
    }

    async ping(): Promise<void> {}
    async close(): Promise<void> {}
  }

  return { Client: MockClient };
});

describe("UpstreamManager", () => {
  let mockFactory: ITransportFactory;
  let manager: UpstreamManager;

  beforeEach(() => {
    mockFactory = {
      createTransport: vi.fn().mockReturnValue({
        start: vi.fn(),
        close: vi.fn(),
        send: vi.fn(),
      } as unknown as Transport),
    };
    manager = new UpstreamManager(mockFactory);
  });

  it("registers and connects multiple upstream servers", async () => {
    const fsConfig: UpstreamConfig = {
      id: "fs_server",
      name: "Filesystem",
      transport: "stdio",
      command: "node",
      args: ["fs.js"],
      env: {},
      enabled: true,
      timeoutMs: 5000,
    };

    const dbConfig: UpstreamConfig = {
      id: "db_server",
      name: "Database",
      transport: "streamable-http",
      url: "https://db.internal.net/mcp",
      headers: {},
      enabled: true,
      timeoutMs: 5000,
    };

    await manager.registerServer(fsConfig);
    await manager.registerServer(dbConfig);

    const summary = manager.getStatusSummary();
    expect(summary).toHaveLength(2);
    expect(summary[0].id).toBe("fs_server");
    expect(summary[0].status).toBe("connected");
    expect(summary[1].id).toBe("db_server");
    expect(summary[1].status).toBe("connected");
  });

  it("aggregates and namespaces tools from all connected servers", async () => {
    await manager.registerServer({
      id: "fs_server",
      name: "Filesystem",
      transport: "stdio",
      command: "node",
      args: [],
      env: {},
      enabled: true,
      timeoutMs: 5000,
    });

    await manager.registerServer({
      id: "db_server",
      name: "Database",
      transport: "streamable-http",
      url: "https://db.internal.net/mcp",
      headers: {},
      enabled: true,
      timeoutMs: 5000,
    });

    const tools = await manager.listAllTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("fs_server__read_file");
    expect(tools[0].description).toContain("[Upstream: fs_server]");
    expect(tools[1].name).toBe("db_server__execute_query");
    expect(tools[1].description).toContain("[Upstream: db_server]");
  });

  it("routes tool calls to the target upstream server with original tool name", async () => {
    await manager.registerServer({
      id: "fs_server",
      name: "Filesystem",
      transport: "stdio",
      command: "node",
      args: [],
      env: {},
      enabled: true,
      timeoutMs: 5000,
    });

    const result = await manager.callTool("fs_server__read_file", {
      path: "/etc/hosts",
    });

    expect(result).toBeDefined();
    expect(result.content[0]).toHaveProperty(
      "text",
      "Result from mcp-sentinel-client-fs_server for read_file"
    );
  });

  it("throws clear error when tool name is not namespaced", async () => {
    await expect(manager.callTool("read_file", {})).rejects.toThrow(
      /Invalid namespaced tool name/
    );
  });

  it("throws clear error when targeted upstream server is not found", async () => {
    await expect(
      manager.callTool("unknown_srv__some_tool", {})
    ).rejects.toThrow(/not registered/);
  });

  it("disconnects all clients on closeAll()", async () => {
    await manager.registerServer({
      id: "fs_server",
      name: "Filesystem",
      transport: "stdio",
      command: "node",
      args: [],
      env: {},
      enabled: true,
      timeoutMs: 5000,
    });

    await manager.closeAll();
    expect(manager.getAllClients()).toHaveLength(0);
  });
});
