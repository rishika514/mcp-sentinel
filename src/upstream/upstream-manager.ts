import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpstreamConfig } from "../types/config.js";
import { UpstreamClient, UpstreamStatus } from "./upstream-client.js";
import {
  parseNamespacedToolName,
  wrapToolForDownstream,
} from "../gateway/namespace.js";
import { ITransportFactory } from "../transports/transport-factory.js";

export interface UpstreamServerSummary {
  id: string;
  name: string;
  transport: string;
  status: UpstreamStatus;
  toolCount: number;
  lastError: string | null;
}

export class UpstreamManager {
  private clients = new Map<string, UpstreamClient>();

  constructor(private transportFactory?: ITransportFactory) {}

  /**
   * Registers a new upstream server. Connects immediately if enabled.
   */
  async registerServer(
    config: UpstreamConfig,
    autoConnect = true
  ): Promise<UpstreamClient> {
    if (this.clients.has(config.id)) {
      await this.removeServer(config.id);
    }

    const client = new UpstreamClient(config, this.transportFactory);
    this.clients.set(config.id, client);

    if (autoConnect && config.enabled) {
      try {
        await client.connect();
      } catch (err) {
        // Log or preserve error state without crashing manager
      }
    }

    return client;
  }

  /**
   * Removes and closes an upstream server.
   */
  async removeServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }
  }

  getClient(serverId: string): UpstreamClient | undefined {
    return this.clients.get(serverId);
  }

  getAllClients(): UpstreamClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Aggregates tools from all connected upstream servers, wrapping them with namespacing.
   */
  async listAllTools(): Promise<Tool[]> {
    const aggregatedTools: Tool[] = [];

    for (const [serverId, client] of this.clients.entries()) {
      if (client.status === "connected") {
        try {
          const tools = await client.refreshTools();
          for (const tool of tools) {
            aggregatedTools.push(wrapToolForDownstream(serverId, tool));
          }
        } catch {
          // If refresh fails, fall back to cached tools
          for (const tool of client.cachedTools) {
            aggregatedTools.push(wrapToolForDownstream(serverId, tool));
          }
        }
      }
    }

    return aggregatedTools;
  }

  /**
   * Dispatches a downstream tool call to the correct upstream server.
   */
  async callTool(
    namespacedToolName: string,
    args: Record<string, unknown> = {}
  ): Promise<CallToolResult> {
    const parsed = parseNamespacedToolName(namespacedToolName);
    if (!parsed) {
      throw new Error(
        `Invalid namespaced tool name: '${namespacedToolName}'. Expected format: '<serverId>__<toolName>'`
      );
    }

    const { serverId, toolName } = parsed;
    const client = this.clients.get(serverId);

    if (!client) {
      throw new Error(
        `Upstream server '${serverId}' is not registered with MCP Sentinel.`
      );
    }

    if (client.status !== "connected") {
      throw new Error(
        `Upstream server '${serverId}' is currently ${client.status}. ${
          client.lastError ? `Reason: ${client.lastError}` : ""
        }`
      );
    }

    return await client.callTool(toolName, args);
  }

  /**
   * Returns a status overview for all upstream servers.
   */
  getStatusSummary(): UpstreamServerSummary[] {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      name: client.name,
      transport: client.config.transport,
      status: client.status,
      toolCount: client.cachedTools.length,
      lastError: client.lastError,
    }));
  }

  /**
   * Closes all upstream connections.
   */
  async closeAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
  }
}
