/**
 * Host as an MCP Apps server for EXTERNAL chat clients (Claude.ai, ChatGPT, Claude Desktop, …).
 *
 *   chat client ──OAuth 2.1 (YOUR auth server)──► THIS endpoint (your MCP server)
 *                                                   ├─ your own business tools
 *                                                   └─ relays FinamX platform tools/resources ──► platform MCP
 *                                                        Bearer <host token> + X-User-Id <your user id>
 *
 * The platform MCP (mcp-catalog) already projects everything MCP Apps needs per host and per user:
 * `present_<extensionId>` (model), `finamx_launch|invoke|action` (app-only), `ui://finamx/<id>/<version>` resources.
 * This relay forwards them 1:1 and keeps `_meta` intact (`ui.resourceUri`, `ui.visibility`, `ui.csp`, the launch
 * handle in the result `_meta`). The host token stays on your server; the chat client only holds YOUR token.
 *
 * Verified against @modelcontextprotocol/sdk 1.29/1.30 and a live platform MCP (see SKILL.md step 6b).
 * Stateless: one relay per HTTP request, like mcp-catalog itself. Cache the platform client per user session if the
 * extra initialize round-trip matters.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface PlatformMcpConfig {
  /** e.g. https://openplatform-mcp.changesandbox.ru/mcp (server env, never the browser). */
  url: string;
  /** Host key from Payload /admin -> Hosts -> Issue key (server env FINAMX_HOST_TOKEN). */
  hostToken: string;
}

/** A tool implemented by the host itself (business logic next to the platform tools). */
export interface HostTool {
  definition: Tool;
  handler: (args: Record<string, unknown>, ctx: { userId: string }) => Promise<CallToolResult>;
}

/**
 * Platform tools an EXTERNAL chat client should see: the MCP Apps set (same allowlist as mcp-catalog's UAT listener).
 * The full platform MCP also serves tools for a host's OWN chat (compose, graph.*, extension.present, divkit.*,
 * extension.install); they have no renderer in Claude.ai/ChatGPT and confuse the model. Consent belongs to your
 * OAuth consent screen, not to a model-called extension.install.
 */
export const EXTERNAL_CLIENT_TOOLS: RegExp[] = [/^present_[A-Za-z0-9_]+$/, /^finamx_(launch|invoke|action)$/, /^extension\.(list|get|schema)$/];

/** Opens a platform MCP client for ONE end user. `userId` must come from YOUR verified OAuth token, never the request body. */
export async function openPlatformClient(cfg: PlatformMcpConfig, userId: string): Promise<Client> {
  if (!userId) throw new Error('userId is required (X-User-Id bucket)');
  const client = new Client(
    { name: 'host-mcp-apps-relay', version: '1.0.0' },
    // Advertise MCP Apps so the platform returns interactive present_* results, not only the text fallback.
    { capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } as never },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers: { Authorization: `Bearer ${cfg.hostToken}`, 'X-User-Id': userId } },
    }),
  );
  return client;
}

/** Builds the MCP server a chat client talks to: platform tools/resources relayed 1:1 + your own tools. */
export function createHostMcpAppsServer(opts: {
  platform: Client;
  userId: string;
  hostTools?: HostTool[];
  /** Which platform tools to relay; defaults to EXTERNAL_CLIENT_TOOLS. */
  exposeTool?: (name: string) => boolean;
}): Server {
  const expose = opts.exposeTool ?? ((name: string) => EXTERNAL_CLIENT_TOOLS.some((re) => re.test(name)));
  const hostTools = new Map((opts.hostTools ?? []).map((t) => [t.definition.name, t]));
  const server = new Server(
    { name: 'my-host-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = (await opts.platform.listTools()).tools.filter((t) => expose(t.name));
    // Host tools must not shadow platform names (present_*, finamx_*, extension.*).
    const clash = tools.find((t) => hostTools.has(t.name));
    if (clash) throw new Error(`host tool ${clash.name} shadows a platform tool`);
    return { tools: [...tools, ...[...hostTools.values()].map((t) => t.definition)] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const own = hostTools.get(req.params.name);
    if (own) return own.handler(req.params.arguments ?? {}, { userId: opts.userId });
    if (!expose(req.params.name)) {
      return { isError: true, content: [{ type: 'text', text: `Tool ${req.params.name} is not available here` }] };
    }
    // present_* from the model and finamx_* from the view both land here; the platform authorises them
    // (token + grants), visibility is only a hint to the client (security.md rule 16).
    return (await opts.platform.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} })) as CallToolResult;
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => opts.platform.listResources());
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => opts.platform.listResourceTemplates());
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => opts.platform.readResource({ uri: req.params.uri }));
  return server;
}

/**
 * POST handler for your `/mcp` route (Express/Node). `verifyUser` validates YOUR OAuth 2.1 access token
 * (audience = this MCP URL) and returns your internal user id, which becomes the platform bucket.
 */
export async function handleHostMcpPost(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
  deps: {
    platform: PlatformMcpConfig;
    verifyUser: (req: IncomingMessage) => Promise<string | null>;
    /** Absolute URL of your Protected Resource Metadata, e.g. https://host.example/.well-known/oauth-protected-resource */
    resourceMetadataUrl: string;
    hostTools?: HostTool[];
  },
): Promise<void> {
  const userId = await deps.verifyUser(req);
  if (!userId) {
    // MCP authorization: the 401 points the client at your Protected Resource Metadata (RFC 9728), which names your AS.
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${deps.resourceMetadataUrl}"`);
    res.end();
    return;
  }
  const platform = await openPlatformClient(deps.platform, userId);
  const server = createHostMcpAppsServer({ platform, userId, hostTools: deps.hostTools });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
    void platform.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
