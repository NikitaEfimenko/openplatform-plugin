'use client';
/**
 * OPTIONAL: MCP Apps projection (standard protocol). Use ONLY when the host wants ext-apps style rendering
 * (ui:// resources in a sandbox proxy) instead of Launch + host-bridge. Trade-offs: see SKILL.md / gaps.md GAP-6.
 *
 * Server (route handlers) + client (renderer) are both here so the wiring is visible in one place.
 * Types checked against @ai-sdk/mcp 2.0.x and @ai-sdk/react 4.0.x 
 *
 * Flow: createMCPClient({ capabilities: mcpAppClientCapabilities }) -> client.listTools()
 *       -> splitMCPAppTools() -> modelVisible go to the model, appVisible (finamx_launch/invoke/action) stay app-only
 *       -> model calls present_<extensionId> -> tool part carries _meta.ui.resourceUri (ui://finamx/<id>/<version>)
 *       -> <MCPAppRenderer part sandbox loadResource> -> readMCPAppResource -> sandbox proxy iframe -> inner iframe (srcdoc)
 *
 * Projection covers only ARTIFACT-mode single-file .html extensions. Legacy `embedBundleUrl` and multi-file
 * artifacts get a text-only present_* result (reason legacy_embed_bundle / multi_file_artifact).
 */
import { experimental_MCPAppRenderer as MCPAppRenderer, type MCPAppRendererProps } from '@ai-sdk/react';
import { readMCPAppResource, splitMCPAppTools, type MCPAppResource } from '@ai-sdk/mcp';
import { openCatalogMcp } from './mcp-connect.server';

// ------------------------------------------------------------------------- SERVER

/** Tools for the model in MCP Apps mode: model-visible only. App-only tools are executed by the bridge handlers below. */
export async function loadMcpAppsTools(userId: string) {
  const client = await openCatalogMcp({ userId, mcpApps: true });
  const defs = await client.listTools();
  const { modelVisible, appVisible } = splitMCPAppTools(defs);
  return {
    client,
    modelTools: client.toolsFromDefinitions(modelVisible),
    /** finamx_launch | finamx_invoke | finamx_action; call them ONLY from MCPAppRenderer handlers.callTool, never expose to the model. */
    appTools: client.toolsFromDefinitions(appVisible),
  };
}

/** POST /api/mcp-app/resource  { uri } -> MCPAppResource (html + meta.csp/permissions). Server-side: uses the host token. */
export function createResourceHandler(resolveUserId: (req: Request) => Promise<string | null>) {
  return async function POST(req: Request): Promise<Response> {
    const userId = await resolveUserId(req);
    if (!userId) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { uri } = (await req.json()) as { uri?: string };
    if (!uri || !uri.startsWith('ui://finamx/')) return Response.json({ error: 'bad uri' }, { status: 400 });
    const client = await openCatalogMcp({ userId, mcpApps: true });
    try {
      const resource: MCPAppResource = await readMCPAppResource({ client, uri });
      return Response.json(resource);
    } finally {
      await client.close();
    }
  };
}

/**
 * POST /api/mcp-app/call  { name, arguments } -> forwards ONLY the app-only tools to the platform MCP.
 * Allowlist is enforced here AND in the renderer (`handlers.allowedTools`): deny by default.
 */
export function createAppToolHandler(resolveUserId: (req: Request) => Promise<string | null>) {
  const ALLOWED = new Set(['finamx_launch', 'finamx_invoke', 'finamx_action']);
  return async function POST(req: Request): Promise<Response> {
    const userId = await resolveUserId(req);
    if (!userId) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { name, arguments: args } = (await req.json()) as { name?: string; arguments?: Record<string, unknown> };
    if (!name || !ALLOWED.has(name)) return Response.json({ error: 'tool not allowed' }, { status: 403 });
    const client = await openCatalogMcp({ userId, mcpApps: true });
    try {
      // The launch token is returned ONLY in result _meta["finamx/launch"]; relay it to the view, never to the model.
      return Response.json(await client.callTool({ name, arguments: args ?? {} }));
    } finally {
      await client.close();
    }
  };
}

// ------------------------------------------------------------------------- CLIENT

type Part = MCPAppRendererProps['part'];

export function FinamxMcpApp(props: {
  part: Part;
  /**
   * URL of YOUR sandbox proxy page. It MUST be served from a DIFFERENT ORIGIN than the host app (e.g. sandbox.acme.example).
   * Protocol (matches @ai-sdk/react src/mcp-apps/app-frame.tsx): the page posts JSON-RPC
   * { jsonrpc:'2.0', method:'ui/notifications/sandbox-proxy-ready' } to window.parent; the host replies with
   * 'ui/notifications/sandbox-resource-ready' { html, csp, sandbox, allow }; the page creates an inner
   * <iframe srcdoc=html sandbox=... allow=...> under that CSP and relays JSON-RPC both ways. See resources/mcp-apps-sandbox-proxy.md.
   */
  sandboxUrl: string;
  theme?: 'light' | 'dark';
}) {
  return (
    <MCPAppRenderer
      part={props.part}
      sandbox={{
        url: props.sandboxUrl,
        allowedPermissions: [], // deny-by-default; add 'camera' | 'microphone' | 'geolocation' | 'clipboardWrite' per product decision
      }}
      loadResource={async ({ resourceUri }) => {
        const res = await fetch('/api/mcp-app/resource', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ uri: resourceUri }),
        });
        if (!res.ok) throw new Error(`resource ${res.status}`);
        return (await res.json()) as MCPAppResource;
      }}
      handlers={{
        allowedTools: ['finamx_launch', 'finamx_invoke', 'finamx_action'], // deny-by-default: list only what the view may call
        callTool: async ({ name, arguments: args }) => {
          const res = await fetch('/api/mcp-app/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, arguments: args }),
          });
          if (!res.ok) throw new Error(`tool ${name}: ${res.status}`);
          return res.json();
        },
        openLink: ({ url }) => {
          if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
        },
      }}
      hostContext={{ theme: props.theme ?? 'light', displayMode: 'inline' }}
      hostInfo={{ name: 'host-chat', version: '1.0.0' }}
      fallback={<small>Interactive UI unavailable; see the text result.</small>}
    />
  );
}
