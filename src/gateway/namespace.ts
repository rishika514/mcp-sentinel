import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const NAMESPACE_DELIMITER = "__";

/**
 * Creates a unique downstream tool name namespaced by upstream server ID.
 * Example: serverId="fs", toolName="read_file" -> "fs__read_file"
 */
export function createNamespacedToolName(
  serverId: string,
  toolName: string
): string {
  return `${serverId}${NAMESPACE_DELIMITER}${toolName}`;
}

/**
 * Parses a namespaced tool name back to its upstream server ID and original tool name.
 * Returns null if the format does not conform.
 */
export function parseNamespacedToolName(
  namespacedName: string
): { serverId: string; toolName: string } | null {
  const index = namespacedName.indexOf(NAMESPACE_DELIMITER);
  if (index <= 0) {
    return null;
  }

  const serverId = namespacedName.slice(0, index);
  const toolName = namespacedName.slice(index + NAMESPACE_DELIMITER.length);

  if (!serverId || !toolName) {
    return null;
  }

  return { serverId, toolName };
}

/**
 * Transforms an upstream tool definition for downstream exposure.
 * Namespaces the name and appends provenance to description.
 */
export function wrapToolForDownstream(serverId: string, tool: Tool): Tool {
  const namespacedName = createNamespacedToolName(serverId, tool.name);
  const provenance = `[Upstream: ${serverId}]`;
  const description = tool.description
    ? `${provenance} ${tool.description}`
    : provenance;

  return {
    ...tool,
    name: namespacedName,
    description,
  };
}
