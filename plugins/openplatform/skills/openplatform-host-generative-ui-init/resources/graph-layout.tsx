'use client';
/**
 * Several extensions on one screen, linked through graph edges, over ONE shared PubSubBroker.
 *
 * What is (and is not) in the SDK — verified:
 *   - PubSubBroker (fan-out by `${channel}:${topicType}`, LVC, echo prevention, per-edge JSON Schema via
 *     setEdgeTopicSchema, setHostDomain) ........................ SDK
 *   - one-frame embed hook with `pubSubBroker` option .......... SDK (useExtensionEmbed)
 *   - multi-frame layout, graph -> frames, edge -> broker ...... NOT in the SDK => this file (GAP-2, GAP-3)
 *   - edge-scoped routing (only source->target) ................ NOT in the SDK (GAP-3): the broker fans out to EVERY
 *     subscriber of channel+topic on the same broker; an edge only contributes (channel, contextType) + schema.
 */
import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { PubSubBroker } from '@finamx/host-bridge';
import type { GraphEdgeRecord, GraphInstanceRecord, HostDomain, UITokens } from '@finamx/bridge-protocol';
import { NativeExtensionFrame } from './embed-frames';
import type { GraphMutation } from './tool-result-adapter';

export type GraphSnapshot = { instances: GraphInstanceRecord[]; edges: GraphEdgeRecord[] };
export const EMPTY_GRAPH: GraphSnapshot = { instances: [], edges: [] };

// ------------------------------------------------------------------ pure mapping (unit-testable)

/** Fold a graph.* tool result into the local snapshot. Idempotent (same instanceId/edgeId replaces). */
export function applyGraphMutation(g: GraphSnapshot, m: GraphMutation): GraphSnapshot {
  switch (m.op) {
    case 'instanceAdded':
      return { ...g, instances: [...g.instances.filter((i) => i.instanceId !== m.instance.instanceId), m.instance] };
    case 'instanceRemoved': {
      if (!m.instanceId) return g;
      const gone = new Set(m.removedEdgeIds ?? []);
      return {
        instances: g.instances.filter((i) => i.instanceId !== m.instanceId),
        // the platform already dropped attached edges; mirror that even if removedEdgeIds is absent
        edges: g.edges.filter((e) => !gone.has(e.edgeId) && e.sourceInstanceId !== m.instanceId && e.targetInstanceId !== m.instanceId),
      };
    }
    case 'edgeApplied':
      return { ...g, edges: [...g.edges.filter((e) => e.edgeId !== m.edge.edgeId), m.edge] };
    case 'edgeRemoved':
      return m.edgeId ? { ...g, edges: g.edges.filter((e) => e.edgeId !== m.edgeId) } : g;
  }
}

export type FrameSpec = {
  instanceId: string;
  extensionId: string;
  label: string;
  /** false => headless: render a placeholder, never Launch (platform rule). Unknown => true (fail open). */
  hasUi: boolean;
  /** Edge ids feeding this frame / leaving it, for badges. */
  incoming: GraphEdgeRecord[];
  outgoing: GraphEdgeRecord[];
};

export function graphToFrames(g: GraphSnapshot, hasUi: (extensionId: string) => boolean | undefined = () => true): FrameSpec[] {
  return g.instances.map((i) => ({
    instanceId: i.instanceId,
    extensionId: i.extensionId,
    label: i.label ?? i.extensionId,
    hasUi: hasUi(i.extensionId) !== false,
    incoming: g.edges.filter((e) => e.targetInstanceId === i.instanceId || (e.direction === 'bidirectional' && e.sourceInstanceId === i.instanceId)),
    outgoing: g.edges.filter((e) => e.sourceInstanceId === i.instanceId || (e.direction === 'bidirectional' && e.targetInstanceId === i.instanceId)),
  }));
}

/**
 * Install per-edge payload schemas on the shared broker. Returns a disposer that clears them.
 * Edges with no `schema` are a no-op here: the broker still validates against the host domain topic schema.
 */
export function applyEdgesToBroker(broker: PubSubBroker, edges: readonly GraphEdgeRecord[]): () => void {
  const installed: string[] = [];
  for (const e of edges) {
    if (e.schema) {
      broker.setEdgeTopicSchema(e.edgeId, e.channel, e.contextType, e.schema);
      installed.push(e.edgeId);
    }
  }
  return () => installed.forEach((id) => broker.clearEdgeTopicSchema(id));
}

// ------------------------------------------------------------------ React

export type GraphAction = { type: 'reset'; graph: GraphSnapshot } | { type: 'mutate'; mutation: GraphMutation };
export function graphReducer(g: GraphSnapshot, a: GraphAction): GraphSnapshot {
  return a.type === 'reset' ? a.graph : applyGraphMutation(g, a.mutation);
}
/** State container for a conversation-level graph: dispatch({type:'mutate', mutation}) from the tool-part renderer. */
export function useGraph(initial: GraphSnapshot = EMPTY_GRAPH) {
  return useReducer(graphReducer, initial);
}

/** ONE broker per screen/conversation. Domain is injected once (fetched once, never per publish). */
export function useSharedBroker(hostDomain: HostDomain | null): PubSubBroker {
  const ref = useRef<PubSubBroker | null>(null);
  if (ref.current === null) ref.current = new PubSubBroker({ hostDomain });
  useEffect(() => {
    ref.current?.setHostDomain(hostDomain);
  }, [hostDomain]);
  return ref.current;
}

export function GraphLayout(props: {
  graph: GraphSnapshot;
  broker: PubSubBroker;
  uiTokens: UITokens;
  platformBase: string;
  hostDomain?: HostDomain | null;
  hasUi?: (extensionId: string) => boolean | undefined;
  /** Grid columns; use 1 on phones. */
  columns?: number;
  frameHeight?: number;
  renderPlaceholder?: (f: FrameSpec) => ReactNode;
}) {
  const { graph, broker } = props;
  const frames = useMemo(() => graphToFrames(graph, props.hasUi), [graph, props.hasUi]);

  useEffect(() => applyEdgesToBroker(broker, graph.edges), [broker, graph.edges]);

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(${props.columns ?? 2}, minmax(0, 1fr))` }}>
      {frames.map((f) => (
        <section key={f.instanceId} aria-label={f.label}>
          <header style={{ fontSize: 12, opacity: 0.7 }}>
            {f.label}
            {f.outgoing.length ? ` -> ${f.outgoing.map((e) => e.contextType).join(', ')}` : ''}
          </header>
          {f.hasUi ? (
            // key by instanceId: two instances of the SAME extension get two Launches and two bridge sessions.
            <NativeExtensionFrame
              extensionId={f.extensionId}
              broker={broker}
              uiTokens={props.uiTokens}
              platformBase={props.platformBase}
              hostDomain={props.hostDomain}
              height={props.frameHeight}
            />
          ) : (
            (props.renderPlaceholder?.(f) ?? <div>{f.label} (headless: no UI)</div>)
          )}
        </section>
      ))}
    </div>
  );
}
