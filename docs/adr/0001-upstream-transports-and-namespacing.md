# ADR 0001: Upstream Transports and Tool Namespacing Strategy

## Status
Accepted

## Context
MCP Sentinel functions as an intelligent, secure gateway sitting between AI applications (clients) and multiple upstream Model Context Protocol (MCP) servers. The gateway aggregates tools, evaluates security policies, and monitors execution.

In architecting the upstream connectivity and tool exposure, two critical design decisions emerge:
1. **Transport Layer Selection**: MCP originally supported standard I/O (`stdio`) for local processes and a dual-endpoint Server-Sent Events pattern (`HTTP+SSE`) for remote servers. The MCP specification has officially deprecated `HTTP+SSE` in favor of **Streamable HTTP** (`StreamableHTTPClientTransport`), which unifies request-response and event streaming into a single HTTP endpoint via POST requests and request-scoped streams.
2. **Tool Collision and Aggregation**: When aggregating tools across multiple upstream servers, naming collisions are inevitable (for example, two servers exposing a `query` or `read_file` tool). The gateway must uniquely identify, expose, and route each tool without ambiguity.

## Decisions

### 1. Transport Support
- **Supported Transports**:
  - `stdio`: Spawns a child process executing a command with arguments and environment variables. Ideal for local tools, CLI wrappers, and secure sandboxes.
  - `streamable-http`: Connects to remote MCP servers using the official MCP `StreamableHTTPClientTransport`.
- **Deprecated Transports**:
  - `sse` / `http-sse` is strictly rejected during runtime validation using Zod schemas. Legacy SSE endpoints are not supported.
- **Explicit Declaration**: Each upstream server configuration in MCP Sentinel must explicitly specify its `transport` type (`stdio` or `streamable-http`).

### 2. Tool Namespacing Strategy
- **Namespace Format**: Upstream tools are exposed downstream using the delimiter `__`: `${serverId}__${originalToolName}`.
  - Example: An upstream server `github` with tool `create_issue` is presented to downstream AI clients as `github__create_issue`.
- **Metadata Preservation**: Downstream tool definitions preserve the original tool metadata, description, and input schema, while augmenting description with upstream server provenance: `[From upstream: github] ...`.
- **Routing & Reverse Resolution**: When a downstream client invokes `tools/call` with `github__create_issue`, the Gateway decomposes the name, verifies the upstream `github` exists, translates the tool name back to `create_issue`, and delegates execution to the corresponding upstream client.
- **Collision Avoidance**: Server IDs are validated using regex (`^[a-z0-9_-]+$`) to ensure valid identifier strings and avoid delimiter parsing ambiguities.

## Consequences
- **Positive**:
  - Full adherence to the latest MCP specifications without legacy transport technical debt.
  - Zero name collision risk across arbitrary numbers of connected upstream servers.
  - Clean separation of concerns between transport lifecycle and routing logic.
- **Trade-offs**:
  - Remote servers still on legacy HTTP+SSE must be upgraded or proxied through a Streamable HTTP adapter.
  - Downstream AI models see prefixed tool names (`serverId__toolName`), which requires clear prompt alignment or tool descriptions noting the server origin.
