import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { UpstreamConfig } from "../types/config.js";

export interface ITransportFactory {
  createTransport(config: UpstreamConfig): Transport;
}

export class DefaultTransportFactory implements ITransportFactory {
  createTransport(config: UpstreamConfig): Transport {
    switch (config.transport) {
      case "stdio": {
        // Prepare environment with inherited process env plus config env
        const env: Record<string, string> = {
          ...(process.env as Record<string, string>),
          ...config.env,
        };

        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env,
        });
      }

      case "streamable-http": {
        const url = new URL(config.url);
        return new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: config.headers,
          },
        });
      }

      default: {
        const exhaustiveCheck: never = config;
        throw new Error(`Unsupported transport: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }
  }
}
