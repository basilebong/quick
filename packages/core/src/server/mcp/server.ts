import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export type Registrar = (server: McpServer) => void;

const SERVER_INFO = { name: "Quick", version: "4.0.0" } as const;

export const runMcpRequest = async (
  register: Registrar,
  req: Request,
  opts?: { instructions?: string },
): Promise<Response> => {
  const server =
    opts?.instructions === undefined
      ? new McpServer(SERVER_INFO)
      : new McpServer(SERVER_INFO, { instructions: opts.instructions });
  register(server);
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);
  return transport.handleRequest(req);
};
