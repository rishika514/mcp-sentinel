import { z } from "zod";

/**
 * Server identifier must be alphanumeric with underscores or hyphens.
 */
export const ServerIdSchema = z
  .string()
  .min(1, "Server ID must not be empty")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Server ID must contain only alphanumeric characters, underscores, or hyphens"
  );

/**
 * Stdio Transport Configuration for local subprocess MCP servers.
 */
export const StdioUpstreamConfigSchema = z.object({
  id: ServerIdSchema,
  name: z.string().min(1, "Server name is required"),
  description: z.string().optional(),
  transport: z.literal("stdio"),
  command: z.string().min(1, "Command is required for stdio transport"),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30000),
});

export type StdioUpstreamConfig = z.infer<typeof StdioUpstreamConfigSchema>;

/**
 * Streamable HTTP Transport Configuration for remote MCP servers.
 * Strictly adheres to the modern MCP specification (replacing legacy HTTP+SSE).
 */
export const StreamableHttpUpstreamConfigSchema = z.object({
  id: ServerIdSchema,
  name: z.string().min(1, "Server name is required"),
  description: z.string().optional(),
  transport: z.literal("streamable-http"),
  url: z.string().url("Valid URL required for streamable-http transport"),
  headers: z.record(z.string()).default({}),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(30000),
});

export type StreamableHttpUpstreamConfig = z.infer<
  typeof StreamableHttpUpstreamConfigSchema
>;

/**
 * Explicit schema rejection for deprecated transports.
 */
export const DeprecatedTransportSchema = z.object({
  id: z.string().optional(),
  transport: z.enum(["sse", "http-sse", "http+sse"]),
}).refine(() => false, {
  message:
    "HTTP+SSE transport is deprecated and strictly unsupported. Use 'streamable-http' instead.",
  path: ["transport"],
});

/**
 * Discriminated union of valid upstream configurations.
 */
export const UpstreamConfigSchema = z.discriminatedUnion("transport", [
  StdioUpstreamConfigSchema,
  StreamableHttpUpstreamConfigSchema,
]);

export type UpstreamConfig = z.infer<typeof UpstreamConfigSchema>;

/**
 * Top-level MCP Sentinel Gateway Configuration Schema.
 */
export const SentinelConfigSchema = z.object({
  name: z.string().default("mcp-sentinel"),
  version: z.string().default("0.1.0"),
  upstreams: z.array(UpstreamConfigSchema).default([]),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type SentinelConfig = z.infer<typeof SentinelConfigSchema>;
