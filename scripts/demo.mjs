import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import process from "node:process";

async function main() {
  const entryPoint = path.resolve("./dist/index.js");
  const targetDir = path.resolve("./demo-workspace");

  // Spawn gateway process over stdio
  const transport = new StdioClientTransport({
    command: "node",
    args: [entryPoint],
    env: {
      ...process.env,
    },
  });

  const client = new Client(
    {
      name: "sentinel-demo-client",
      version: "0.1.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  // 1. Call tools/list and print every tool name received
  const toolsResponse = await client.listTools();
  console.log(`=== Discovered ${toolsResponse.tools.length} Tools across Upstreams ===`);
  for (const tool of toolsResponse.tools) {
    console.log(`Tool: ${tool.name} | Description: ${tool.description}`);
  }

  // 2. Call one tool (e.g., list_directory) and print the result
  const listDirTool = toolsResponse.tools.find((t) =>
    t.name.endsWith("__list_directory")
  );

  if (listDirTool) {
    console.log(`\n=== Calling Tool: ${listDirTool.name} ===`);
    const result = await client.callTool({
      name: listDirTool.name,
      arguments: {
        path: targetDir,
      },
    });
    console.log("Tool Result:");
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("No list_directory tool found in tools list.");
  }

  // 3. Exit cleanly
  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Demo failed with error:", err);
  process.exit(1);
});
