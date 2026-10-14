import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseSentinelConfig } from "./config/validator.js";
import { GatewayServer, GatewayLogger } from "./gateway/gateway-server.js";
import { UpstreamManager } from "./upstream/upstream-manager.js";
import { redactData } from "./redaction/redact.js";

/**
 * Custom logger that routes exclusively to stderr to avoid corrupting stdio MCP transport on stdout.
 */
class StderrGatewayLogger implements GatewayLogger {
  constructor(private logLevel: string = "info") {}

  private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel as any);
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog("debug")) {
      process.stderr.write(
        `[DEBUG] ${message} ${meta ? JSON.stringify(redactData(meta)) : ""}\n`
      );
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog("info")) {
      process.stderr.write(
        `[INFO] ${message} ${meta ? JSON.stringify(redactData(meta)) : ""}\n`
      );
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog("warn")) {
      process.stderr.write(
        `[WARN] ${message} ${meta ? JSON.stringify(redactData(meta)) : ""}\n`
      );
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.shouldLog("error")) {
      process.stderr.write(
        `[ERROR] ${message} ${meta ? JSON.stringify(redactData(meta)) : ""}\n`
      );
    }
  }
}

/**
 * Loads and normalizes upstream server configuration from file.
 */
function loadConfiguration(): ReturnType<typeof parseSentinelConfig> {
  const configPath =
    process.env.MCP_SENTINEL_CONFIG ||
    path.resolve(process.cwd(), "mcp-servers.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Configuration file not found at: ${configPath}. Set MCP_SENTINEL_CONFIG to override.`
    );
  }

  const rawContent = fs.readFileSync(configPath, "utf-8");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from config file '${configPath}': ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Handle various formats (array of servers, Claude-style mcpServers map, or SentinelConfig)
  let normalizedConfig: unknown;
  if (Array.isArray(parsedJson)) {
    normalizedConfig = {
      name: "mcp-sentinel",
      version: "0.1.0",
      upstreams: parsedJson,
    };
  } else if (
    parsedJson &&
    typeof parsedJson === "object" &&
    "mcpServers" in parsedJson &&
    typeof (parsedJson as any).mcpServers === "object"
  ) {
    const serversMap = (parsedJson as any).mcpServers;
    const upstreams = Object.entries(serversMap).map(([id, srv]: [string, any]) => ({
      id,
      name: srv.name || id,
      transport: srv.transport || "stdio",
      command: srv.command,
      args: srv.args || [],
      env: srv.env || {},
      url: srv.url,
      headers: srv.headers || {},
      enabled: srv.enabled !== false,
    }));
    normalizedConfig = {
      name: "mcp-sentinel",
      version: "0.1.0",
      upstreams,
    };
  } else {
    normalizedConfig = parsedJson;
  }

  return parseSentinelConfig(normalizedConfig);
}

export async function main(): Promise<void> {
  const config = loadConfiguration();
  const logger = new StderrGatewayLogger(config.logLevel);
  const upstreamManager = new UpstreamManager();
  const gateway = new GatewayServer(config, upstreamManager, logger);

  // Initialize all upstreams
  await gateway.initialize();

  // Log per-upstream status to stderr (connected/reachable, tool count discovered)
  const summaries = upstreamManager.getStatusSummary();
  for (const summary of summaries) {
    const statusText =
      summary.status === "connected" ? "connected/reachable" : summary.status;
    process.stderr.write(
      `[MCP Sentinel] Upstream '${summary.id}' (${summary.name}): ${statusText}, ${summary.toolCount} tools discovered\n`
    );
  }

  // Start gateway on stdio for downstream MCP clients
  const transport = new StdioServerTransport();
  await gateway.connect(transport);

  // Handle graceful shutdown signals
  const cleanup = async () => {
    process.stderr.write("[MCP Sentinel] Shutting down gateway...\n");
    await gateway.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// Run main if this is the process entry point
main().catch((err) => {
  process.stderr.write(
    `[MCP Sentinel Fatal Error] ${err instanceof Error ? err.stack || err.message : String(err)}\n`
  );
  process.exit(1);
});
