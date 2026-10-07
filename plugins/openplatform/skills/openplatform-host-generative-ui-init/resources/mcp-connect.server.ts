/**
 * SERVER: connect the platform MCP (mcp-catalog, Streamable HTTP) to an AI SDK `streamText` chat route.
 * Type-checked against ai@7 / @ai-sdk/mcp@2 (ai@6 / @ai-sdk/mcp@1 have the same
 * `createMCPClient({ transport: { type: 'http', url, headers } })` shape).
 *
 * Endpoint: `${MCP_CATALOG_URL ?? 'https://openplatform-mcp.changesandbox.ru'}/mcp`
 * Headers : Authorization: Bearer <FINAMX_HOST_TOKEN>   REQUIRED (401 without; 403 invalid/suspended)
 *           X-User-Id: <your end-user id>                REQUIRED for extension.install and any per-user result
 *                                                        (install => tool_error BUCKET_REQUIRED; present_* => 400)
 * Server-side ONLY: the token must never reach the browser. One client per request; close it when the stream ends.
 * If the MCP is reached by a non-loopback hostname, add it to the MCP process env MCP_ALLOWED_HOSTS.
 */
import { createMCPClient, mcpAppClientCapabilities } from '@ai-sdk/mcp';
import { convertToModelMessages, stepCountIs, streamText, type LanguageModel, type ToolSet, type UIMessage } from 'ai';
import { sanitizeToolName } from './tool-result-adapter';
import { FINAMX_GENERATIVE_UI_INSTRUCTIONS } from './system-prompt';

export type CatalogMcpOptions = {
  userId: string;
  /** Include the MCP Apps projection (present_* tools + ui:// resources)? Default false (native/HTML path). */
  mcpApps?: boolean;
};

export function catalogMcpUrl(): string {
  return `${(process.env.MCP_CATALOG_URL ?? 'https://openplatform-mcp.changesandbox.ru').replace(/\/$/, '')}/mcp`;
}

export async function openCatalogMcp(opts: CatalogMcpOptions) {
  const token = process.env.FINAMX_HOST_TOKEN?.trim();
  if (!token) throw new Error('FINAMX_HOST_TOKEN is not set');
  return createMCPClient({
    transport: {
      type: 'http',
      url: catalogMcpUrl(),
      headers: { Authorization: `Bearer ${token}`, 'X-User-Id': opts.userId },
    },
    // Only declare MCP Apps support when this chat can actually render ui:// resources (mcp-apps-chat.tsx).
    ...(opts.mcpApps ? { capabilities: mcpAppClientCapabilities } : {}),
  });
}

const MCP_APPS_ONLY = /^(present_|finamx_(launch|invoke|action)$)/;

/**
 * Native/HTML mode: hide the MCP Apps tools from the model (present_*, finamx_*) so the model uses
 * extension.present + Launch instead.
 * Also renames dotted tool names for providers that reject dots (extension.list -> extension_list).
 */
export function toModelTools(tools: ToolSet, opts: { mcpApps?: boolean } = {}): ToolSet {
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(tools)) {
    if (!opts.mcpApps && MCP_APPS_ONLY.test(name)) continue;
    out[sanitizeToolName(name)] = t;
  }
  return out;
}

export async function handleChatRequest(req: Request, deps: { model: LanguageModel; userId: string; extraInstructions?: string }): Promise<Response> {
  const { messages } = (await req.json()) as { messages: UIMessage[] };
  const client = await openCatalogMcp({ userId: deps.userId });
  const tools = toModelTools(await client.tools());

  const result = streamText({
    model: deps.model,
    system: [FINAMX_GENERATIVE_UI_INSTRUCTIONS, deps.extraInstructions].filter(Boolean).join('\n\n'),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    stopWhen: stepCountIs(12), // 12 steps: list -> install -> present / compose + graph chains need headroom
    onFinish: () => void client.close(),
    onError: () => void client.close(),
  });
  return result.toUIMessageStreamResponse();
}
