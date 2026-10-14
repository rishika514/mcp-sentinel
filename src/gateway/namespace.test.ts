import { describe, it, expect } from "vitest";
import {
  createNamespacedToolName,
  parseNamespacedToolName,
  wrapToolForDownstream,
} from "./namespace.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

describe("Gateway Namespacing", () => {
  it("creates namespaced tool names correctly", () => {
    expect(createNamespacedToolName("github", "create_issue")).toBe(
      "github__create_issue"
    );
    expect(createNamespacedToolName("postgres-db", "query")).toBe(
      "postgres-db__query"
    );
  });

  it("parses valid namespaced tool names", () => {
    const result = parseNamespacedToolName("github__create_issue");
    expect(result).toEqual({
      serverId: "github",
      toolName: "create_issue",
    });

    // Substrings with multiple underscores
    const multiUnder = parseNamespacedToolName("server__tool__subaction");
    expect(multiUnder).toEqual({
      serverId: "server",
      toolName: "tool__subaction",
    });
  });

  it("returns null for non-namespaced tool names", () => {
    expect(parseNamespacedToolName("simple_tool")).toBeNull();
    expect(parseNamespacedToolName("__tool_without_server")).toBeNull();
    expect(parseNamespacedToolName("server__")).toBeNull();
    expect(parseNamespacedToolName("")).toBeNull();
  });

  it("wraps upstream tool with namespaced name and provenance in description", () => {
    const rawTool: Tool = {
      name: "fetch_data",
      description: "Fetches user records from store",
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" },
        },
        required: ["userId"],
      },
    };

    const wrapped = wrapToolForDownstream("users_api", rawTool);
    expect(wrapped.name).toBe("users_api__fetch_data");
    expect(wrapped.description).toBe(
      "[Upstream: users_api] Fetches user records from store"
    );
    expect(wrapped.inputSchema).toEqual(rawTool.inputSchema);
  });
});
