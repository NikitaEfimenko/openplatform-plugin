/**
 * Pure adapter: (tool name, raw tool output) -> RenderDecision. No React, no network.
 *
 * Built ONLY from SDK primitives:
 *   unwrapMcpToolOutput / safeParsePresentableAgentUi   from '@finamx/bridge-protocol/agent-ui'
 *
 * Decision table (SKILL.md has the prose version):
 *
 *   tool `extension.present` / `compose` result = PresentableAgentUi envelope
 *     spec external-embed + extensionId          -> native-extension  (Launch; envelope embedUrl /preview/<id> is a 404, IGNORE it)
 *     spec compose-html | html                   -> agent-html        (iframe embedUrl; CMS injects window.__finamx stub)
 *     spec compose | divkit  (+ divkitJson)      -> agent-divkit      (iframe embedUrl, or DivKitJsonHost from '@finamx/host-bridge/widgets')
 *     spec divkit + widgetSlug, no divkitJson    -> agent-divkit      (deprecated slug path; iframe embedUrl)
 *   tool `graph.*`    result JSON                -> graph-mutation    (host mirrors into its layout)
 *   tool `present_*`  (MCP Apps projection)      -> mcp-app           (render the TOOL PART with experimental_MCPAppRenderer)
 *   tool_error / isError                         -> error
 *   anything else                                -> text
 */
import {
  safeParsePresentableAgentUi,
  unwrapMcpToolOutput,
  type PresentableAgentUi,
} from '@finamx/bridge-protocol/agent-ui';

// ------------------------------------------------------------------ tool names

/** Platform MCP tool names, canonical (dotted) form. Verified against the platform MCP server. */
export const CATALOG_TOOLS = [
  'extension.list',
  'extension.get',
  'extension.schema',
  'extension.install',
  'extension.present',
  'compose',
  'get_host_domain',
  'capability.list',
  'graph.addInstance',
  'graph.removeInstance',
  'graph.applyEdge',
  'graph.removeEdge',
  'divkit.list', // deprecated
  'divkit.get', // deprecated
] as const;
export type CatalogTool = (typeof CATALOG_TOOLS)[number];

/** LLM providers reject dots in tool names, so hosts rename `extension.list` -> `extension_list`; some prefix `mcp__<server>__`. */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** Map whatever name the chat UI shows back to the canonical catalog name (or the raw name if unknown). */
export function canonicalToolName(raw: string): CatalogTool | string {
  const s = sanitizeToolName(raw);
  let best: CatalogTool | undefined;
  for (const known of CATALOG_TOOLS) {
    const k = sanitizeToolName(known);
    if (s === k || s.endsWith(`__${k}`) || s.endsWith(`_${k}`)) {
      if (!best || known.length > best.length) best = known;
    }
  }
  return best ?? raw.replace(/^mcp__[A-Za-z0-9_]*?__/, '');
}

export const isMcpAppPresentTool = (name: string): boolean => /(^|__)present_[a-z0-9_]+$/.test(name);

// ------------------------------------------------------------------ decisions

export type AgentUiCommon = {
  title: string;
  /** 'update' + targetWidgetId => replace the existing frame with that id instead of appending. */
  action: 'present' | 'update';
  targetWidgetId?: string;
  pubsub?: { publishes: string[]; subscribes: string[] };
  vizSourceTopic?: string;
  /** Stable key for de-duplication: reuse the envelope fingerprint if present. */
  key: string;
};

export type GraphMutation =
  | { op: 'instanceAdded'; instance: { instanceId: string; extensionId: string; label?: string } }
  | { op: 'instanceRemoved'; instanceId?: string; removedEdgeIds?: string[] }
  | {
      op: 'edgeApplied';
      edge: {
        edgeId: string;
        sourceInstanceId: string;
        targetInstanceId: string;
        channel: string;
        contextType: string;
        direction: 'forward' | 'bidirectional';
        schemaRef?: string;
        schema?: Record<string, unknown>;
      };
    }
  | { op: 'edgeRemoved'; edgeId?: string };

export type RenderDecision =
  | { kind: 'native-extension'; extensionId: string; route?: string; title: string; key: string }
  | ({ kind: 'agent-html'; embedUrl: string } & AgentUiCommon)
  | ({ kind: 'agent-divkit'; embedUrl: string; divkitJson?: Record<string, unknown> } & AgentUiCommon)
  | { kind: 'graph-mutation'; mutation: GraphMutation; sinkDelivered?: boolean }
  | { kind: 'mcp-app'; toolName: string }
  | { kind: 'error'; message: string }
  | { kind: 'text'; text: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (isRecord(v)) return v;
  if (typeof v === 'string') {
    try {
      const p: unknown = JSON.parse(v);
      return isRecord(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function common(ui: PresentableAgentUi, fallbackTitle: string): AgentUiCommon {
  return {
    title: ui.title ?? ui.widgetSlug ?? ui.extensionId ?? fallbackTitle,
    action: ui.action,
    ...(ui.targetWidgetId ? { targetWidgetId: ui.targetWidgetId } : {}),
    ...(ui.pubsub ? { pubsub: ui.pubsub } : {}),
    ...(ui.vizSourceTopic ? { vizSourceTopic: ui.vizSourceTopic } : {}),
    key: ui.fingerprint ?? ui.embedUrl,
  };
}

function graphMutationFrom(canonical: string, body: Record<string, unknown>): GraphMutation | null {
  if (canonical === 'graph.addInstance' && isRecord(body.instance)) {
    const i = body.instance;
    if (typeof i.instanceId === 'string' && typeof i.extensionId === 'string') {
      return {
        op: 'instanceAdded',
        instance: { instanceId: i.instanceId, extensionId: i.extensionId, ...(typeof i.label === 'string' ? { label: i.label } : {}) },
      };
    }
  }
  if (canonical === 'graph.applyEdge' && isRecord(body.edge)) {
    const e = body.edge;
    if (
      typeof e.edgeId === 'string' &&
      typeof e.sourceInstanceId === 'string' &&
      typeof e.targetInstanceId === 'string' &&
      typeof e.channel === 'string' &&
      typeof e.contextType === 'string'
    ) {
      return {
        op: 'edgeApplied',
        edge: {
          edgeId: e.edgeId,
          sourceInstanceId: e.sourceInstanceId,
          targetInstanceId: e.targetInstanceId,
          channel: e.channel,
          contextType: e.contextType,
          direction: e.direction === 'bidirectional' ? 'bidirectional' : 'forward',
          ...(typeof e.schemaRef === 'string' ? { schemaRef: e.schemaRef } : {}),
          ...(isRecord(e.schema) ? { schema: e.schema } : {}),
        },
      };
    }
  }
  // Remove tools return { ok: true, removed: true, removedEdgeIds? } — the id is in the TOOL INPUT, not the result.
  if (canonical === 'graph.removeInstance') {
    return {
      op: 'instanceRemoved',
      ...(Array.isArray(body.removedEdgeIds) ? { removedEdgeIds: body.removedEdgeIds.filter((x): x is string => typeof x === 'string') } : {}),
    };
  }
  if (canonical === 'graph.removeEdge') return { op: 'edgeRemoved' };
  return null;
}

/**
 * @param toolName raw name as shown in the chat (dotted, sanitized, or mcp__server__ prefixed)
 * @param output   tool result as delivered to the UI (MCP CallToolResult, structuredContent, JSON string, or object)
 * @param input    tool input (needed to know WHICH instance/edge a remove* call referred to)
 */
export function decideRender(toolName: string, output: unknown, input?: unknown): RenderDecision {
  const canonical = canonicalToolName(toolName);

  if (isMcpAppPresentTool(toolName)) return { kind: 'mcp-app', toolName };

  const unwrapped = unwrapMcpToolOutput(output);
  const record = asRecord(unwrapped);

  if (record && (record.isError === true || typeof record.tool_error === 'string')) {
    const msg =
      (typeof record.message === 'string' && record.message) ||
      (typeof record.tool_error === 'string' && record.tool_error) ||
      'Tool failed';
    return { kind: 'error', message: msg };
  }

  if (typeof canonical === 'string' && canonical.startsWith('graph.') && record) {
    const mutation = graphMutationFrom(canonical, record);
    if (mutation) {
      const inRec = asRecord(input);
      if (mutation.op === 'instanceRemoved' && typeof inRec?.instanceId === 'string') mutation.instanceId = inRec.instanceId;
      if (mutation.op === 'edgeRemoved' && typeof inRec?.edgeId === 'string') mutation.edgeId = inRec.edgeId;
      return {
        kind: 'graph-mutation',
        mutation,
        ...(typeof record.sinkDelivered === 'boolean' ? { sinkDelivered: record.sinkDelivered } : {}),
      };
    }
  }

  if (canonical === 'extension.present' || canonical === 'compose') {
    const parsed = safeParsePresentableAgentUi(output);
    if (!parsed.success) return { kind: 'error', message: parsed.error };
    const ui = parsed.data;

    // Registry extension: ALWAYS Launch. The envelope's embedUrl is /preview/<extensionId> which CMS answers 404
    // (that route only serves DivKit Widgets slugs). Do not iframe it.
    if (ui.spec === 'external-embed' && ui.extensionId) {
      return {
        kind: 'native-extension',
        extensionId: ui.extensionId,
        title: ui.title ?? ui.extensionId,
        key: ui.fingerprint ?? `ext:${ui.extensionId}`,
      };
    }
    if (ui.spec === 'compose-html' || ui.spec === 'html') {
      return { kind: 'agent-html', embedUrl: ui.embedUrl, ...common(ui, 'Agent HTML') };
    }
    if (ui.spec === 'compose' || ui.spec === 'divkit') {
      return {
        kind: 'agent-divkit',
        embedUrl: ui.embedUrl,
        ...(ui.divkitJson ? { divkitJson: ui.divkitJson } : {}),
        ...common(ui, 'Agent DivKit'),
      };
    }
    // a2ui-passthrough or anything unknown: never guess a renderer
    return { kind: 'text', text: JSON.stringify(unwrapped, null, 2) };
  }

  return { kind: 'text', text: typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped, null, 2) };
}
