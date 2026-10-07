'use client';
/**
 * Chat message part renderer for the AI SDK UI message model (`useChat` -> message.parts).
 * For non-AI-SDK chats (custom SSE) call `decideRender(toolName, result)` yourself
 * from your own tool-result event and render the same switch (see worked-example-custom-chat.md).
 *
 *   {message.parts.map((part, i) => <GenerativeToolPart key={i} part={part} ctx={ctx} />)}
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { getToolOrDynamicToolName, isToolUIPart, type UIMessage } from 'ai';
import type { HostDomain, UITokens } from '@finamx/bridge-protocol';
import type { PubSubBroker } from '@finamx/host-bridge';
import { AgentGeneratedFrame, NativeExtensionFrame } from './embed-frames';
import { decideRender, type GraphMutation, type RenderDecision } from './tool-result-adapter';

export type GenerativeUiContext = {
  /** Conversation-level shared broker (useSharedBroker in graph-layout.tsx). */
  broker: PubSubBroker;
  uiTokens: UITokens;
  platformBase: string;
  hostDomain?: HostDomain | null;
  /** Stable id of the chat/thread; prefixes agent-frame bridge session ids. */
  chatId: string;
  /** Receive graph.* results (feed graph-layout's useGraph dispatch). Optional. */
  onGraphMutation?: (m: GraphMutation) => void;
  /** Slot for MCP Apps (present_* tools); see mcp-apps-chat.tsx. Optional. */
  renderMcpApp?: (part: UIMessage['parts'][number]) => ReactNode;
  /** Optional native DivKit renderer for agent-divkit decisions (DivKitJsonHost from '@finamx/host-bridge/widgets'). */
  renderDivKit?: (json: Record<string, unknown>, id: string) => ReactNode;
  frameHeight?: number;
};

export function GenerativeToolPart(props: { part: UIMessage['parts'][number]; ctx: GenerativeUiContext }): ReactNode {
  const { part, ctx } = props;
  if (!isToolUIPart(part)) return null;
  if (part.state !== 'output-available') return null; // input-streaming / input-available / output-error: let your default tool chip handle these

  const toolName = getToolOrDynamicToolName(part);
  const decision = decideRender(toolName, part.output, part.input);
  return <DecisionView decision={decision} toolCallId={part.toolCallId} part={part} ctx={ctx} />;
}

function DecisionView(props: {
  decision: RenderDecision;
  toolCallId: string;
  part: UIMessage['parts'][number];
  ctx: GenerativeUiContext;
}): ReactNode {
  const { decision: d, ctx } = props;
  const base = { broker: ctx.broker, uiTokens: ctx.uiTokens, platformBase: ctx.platformBase, hostDomain: ctx.hostDomain, height: ctx.frameHeight };

  // graph mutations are side effects on host state: apply exactly once per tool call (StrictMode / re-render safe)
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (d.kind === 'graph-mutation' && applied.current !== props.toolCallId) {
      applied.current = props.toolCallId;
      ctx.onGraphMutation?.(d.mutation);
    }
  }, [d, ctx, props.toolCallId]);

  switch (d.kind) {
    case 'native-extension':
      return <NativeExtensionFrame extensionId={d.extensionId} {...base} />;
    case 'agent-html':
      return <AgentGeneratedFrame sessionId={`${ctx.chatId}:${props.toolCallId}`} embedUrl={d.embedUrl} {...base} />;
    case 'agent-divkit':
      if (d.divkitJson && ctx.renderDivKit) return ctx.renderDivKit(d.divkitJson, `${ctx.chatId}:${props.toolCallId}`);
      return <AgentGeneratedFrame sessionId={`${ctx.chatId}:${props.toolCallId}`} embedUrl={d.embedUrl} {...base} />;
    case 'graph-mutation':
      return <small>graph: {d.mutation.op}{d.sinkDelivered === false ? ' (no host sink; graph saved on platform)' : ''}</small>;
    case 'mcp-app':
      return ctx.renderMcpApp ? ctx.renderMcpApp(props.part) : null;
    case 'error':
      return <p role="alert">{d.message}</p>;
    case 'text':
      return null; // let the default tool-result chip show it
  }
}
