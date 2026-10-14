import {
  SentinelConfig,
  SentinelConfigSchema,
  UpstreamConfig,
  UpstreamConfigSchema,
} from "../types/config.js";

export class ConfigValidationError extends Error {
  constructor(message: string, public readonly issues?: unknown[]) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * Validates a single upstream server configuration.
 * Explicitly guards against deprecated transports (e.g. sse, http+sse).
 */
export function parseUpstreamConfig(raw: unknown): UpstreamConfig {
  if (raw && typeof raw === "object" && "transport" in raw) {
    const transport = String((raw as { transport: unknown }).transport).toLowerCase();
    if (["sse", "http-sse", "http+sse"].includes(transport)) {
      throw new ConfigValidationError(
        `Transport '${transport}' is deprecated and strictly unsupported by MCP Sentinel. Use 'streamable-http' or 'stdio'.`
      );
    }
  }

  const result = UpstreamConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues ?? [];
    const errorDetails = issues
      .map((e) => `${e.path.join(".") || "root"}: ${e.message}`)
      .join("; ");
    throw new ConfigValidationError(
      `Invalid upstream server configuration: ${errorDetails}`,
      issues
    );
  }

  return result.data;
}

/**
 * Validates full Sentinel gateway configuration, including upstream uniqueness check.
 */
export function parseSentinelConfig(raw: unknown): SentinelConfig {
  // First, check each upstream if provided
  if (raw && typeof raw === "object" && "upstreams" in raw && Array.isArray((raw as { upstreams: unknown[] }).upstreams)) {
    const upstreamsList = (raw as { upstreams: unknown[] }).upstreams;
    for (const upstream of upstreamsList) {
      // Validate individual upstream to catch deprecated transports
      parseUpstreamConfig(upstream);
    }
  }

  const result = SentinelConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues ?? [];
    const errorDetails = issues
      .map((e) => `${e.path.join(".") || "root"}: ${e.message}`)
      .join("; ");
    throw new ConfigValidationError(
      `Invalid Sentinel configuration: ${errorDetails}`,
      issues
    );
  }

  // Check for duplicate server IDs
  const seenIds = new Set<string>();
  for (const upstream of result.data.upstreams) {
    if (seenIds.has(upstream.id)) {
      throw new ConfigValidationError(
        `Duplicate upstream server ID detected: '${upstream.id}'. Each upstream server must have a unique ID.`
      );
    }
    seenIds.add(upstream.id);
  }

  return result.data;
}
