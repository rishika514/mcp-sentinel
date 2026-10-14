import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SentinelConfig } from "../types/config.js";
import { UpstreamManager } from "../upstream/upstream-manager.js";
import { summarizePayload, redactData } from "../redaction/redact.js";

export interface GatewayLogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export class DefaultGatewayLogger implements GatewayLogger {
  constructor(private logLevel: string = "info") {}

  private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel as any);
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog("debug")) {
      console.debug(`[DEBUG] ${message}`, meta ? redactData(meta) : "");
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog("info")) {
      console.info(`[INFO] ${message}`, meta ? redactData(meta) : "");
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${message}`, meta ? redactData(meta) : "");
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${message}`, meta ? redactData(meta) : "");
    }
  }
}

export class GatewayServer {
  private server: Server;
  public readonly upstreamManager: UpstreamManager;
  private logger: GatewayLogger;

  constructor(
    public readonly config: SentinelConfig,
    upstreamManager?: UpstreamManager,
    logger?: GatewayLogger
  ) {
    this.upstreamManager = upstreamManager ?? new UpstreamManager();
    this.logger = logger ?? new DefaultGatewayLogger(config.logLevel);

    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerHandlers();
  }

  /**
   * Initializes upstream connections from configuration.
   */
  async initialize(): Promise<void> {
    this.logger.info(`Initializing MCP Sentinel gateway: ${this.config.name}`);

    for (const upstreamConfig of this.config.upstreams) {
      if (upstreamConfig.enabled) {
        try {
          this.logger.info(
            `Registering upstream server: ${upstreamConfig.id} (${upstreamConfig.transport})`
          );
          await this.upstreamManager.registerServer(upstreamConfig, true);
        } catch (err) {
          this.logger.error(
            `Failed to connect to upstream '${upstreamConfig.id}': ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }
  }

  private registerHandlers(): void {
    // tools/list handler: aggregates tools across upstream servers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug("Received downstream tools/list request");
      const tools = await this.upstreamManager.listAllTools();
      this.logger.debug(`Aggregated ${tools.length} downstream tools`);
      return { tools };
    });

    // tools/call handler: routes namespaced tool calls to target upstream
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<CallToolResult> => {
        const { name, arguments: args = {} } = request.params;

        // Redacted payload summary logging (never log raw secrets)
        const argsSummary = summarizePayload(args);
        this.logger.info(`Received downstream tool call: ${name}`, {
          tool: name,
          argsSummary,
        });

        try {
          const result = await this.upstreamManager.callTool(name, args);
          this.logger.info(`Tool call completed successfully: ${name}`);
          return result;
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : String(err);
          this.logger.error(`Tool call failed: ${name}`, {
            error: errorMessage,
          });

          return {
            content: [
              {
                type: "text",
                text: `MCP Sentinel Gateway Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  /**
   * Attaches the gateway server to a transport (stdio or streamable-http for downstream clients).
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
    this.logger.info("MCP Sentinel gateway connected to downstream transport.");
  }

  /**
   * Closes downstream server and disconnects all upstreams.
   */
  async close(): Promise<void> {
    this.logger.info("Shutting down MCP Sentinel gateway...");
    try {
      await this.server.close();
    } catch {
      // Suppress server close errors
    }
    await this.upstreamManager.closeAll();
    this.logger.info("MCP Sentinel gateway shutdown complete.");
  }

  getServer(): Server {
    return this.server;
  }
}
