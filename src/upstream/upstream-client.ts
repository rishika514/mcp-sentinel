import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpstreamConfig } from "../types/config.js";
import {
  DefaultTransportFactory,
  ITransportFactory,
} from "../transports/transport-factory.js";

export type UpstreamStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export class UpstreamClient {
  private client: Client | null = null;
  private _status: UpstreamStatus = "disconnected";
  private _lastError: string | null = null;
  private _tools: Tool[] = [];

  constructor(
    public readonly config: UpstreamConfig,
    private transportFactory: ITransportFactory = new DefaultTransportFactory()
  ) {}

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get status(): UpstreamStatus {
    return this._status;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get cachedTools(): Tool[] {
    return [...this._tools];
  }

  /**
   * Establishes connection to upstream MCP server and retrieves available tools.
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      this._status = "disconnected";
      return;
    }

    this._status = "connecting";
    this._lastError = null;

    try {
      const transport = this.transportFactory.createTransport(this.config);
      this.client = new Client(
        {
          name: `mcp-sentinel-client-${this.config.id}`,
          version: "0.1.0",
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(transport);
      this._status = "connected";

      // Cache available tools
      await this.refreshTools();
    } catch (err) {
      this._status = "error";
      this._lastError =
        err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Refreshes list of tools from the upstream server.
   */
  async refreshTools(): Promise<Tool[]> {
    if (!this.client || this._status !== "connected") {
      throw new Error(`Upstream server '${this.id}' is not connected.`);
    }

    const response = await this.client.listTools();
    this._tools = response.tools || [];
    return this._tools;
  }

  /**
   * Dispatches a tool call to this upstream server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<CallToolResult> {
    if (!this.client || this._status !== "connected") {
      throw new Error(`Upstream server '${this.id}' is not connected.`);
    }

    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    return result as CallToolResult;
  }

  /**
   * Pings the upstream server to verify connectivity.
   */
  async ping(): Promise<boolean> {
    if (!this.client || this._status !== "connected") {
      return false;
    }

    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Closes the upstream connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Suppress close errors
      }
      this.client = null;
    }
    this._status = "disconnected";
    this._tools = [];
  }
}
