'use client';
/**
 * Two frame components, both wired to ONE shared PubSubBroker (pass the same instance to every frame):
 *
 *   <NativeExtensionFrame>   registry extension: Launch (via host backend) + host-bridge + embedPolicy
 *   <AgentGeneratedFrame>    agent HTML/DivKit `embedUrl` from compose / extension.present
 *
 * Both use `useExtensionEmbed` (NOT `ExtensionEmbedFrame`): ExtensionEmbedFrame has no `pubSubBroker`,
 * `mintIdentity`, `mintAuthContext` or `platformBase` props (verified in extension-embed-frame.tsx), so it is
 * only suitable for a single, isolated frame. See GAP-1 in resources/gaps.md.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  buildAgentGeneratedEmbedSession,
  createHostCapabilityRouter,
  useExtensionEmbed,
  useLaunchErrorWall,
  type PubSubBroker,
} from '@finamx/host-bridge';
import type { BridgeSessionConfig, HostDomain, UITokens } from '@finamx/bridge-protocol';
import { installExtension, isConsentRequired, loadExtensionLaunch, type LoadedExtension } from './host-launch-client';

type CommonProps = {
  /** THE shared broker for every frame on this screen/conversation. */
  broker: PubSubBroker;
  uiTokens: UITokens;
  /** CMS base reachable from the browser (invoke proxy: POST {platformBase}/api/v1/invoke with the launch JWT). */
  platformBase: string;
  hostDomain?: HostDomain | null;
  height?: number;
  className?: string;
};

// ---------------------------------------------------------------------------------------------
// Registry extension, natively mounted
// ---------------------------------------------------------------------------------------------

type LaunchState =
  | { status: 'loading' }
  | { status: 'ready'; loaded: LoadedExtension }
  | { status: 'consent' }
  | { status: 'error'; error: unknown };

export function NativeExtensionFrame(
  props: CommonProps & {
    extensionId: string;
    /** Custom consent UI. Default: a minimal Allow button that calls installExtension + retries. */
    renderConsent?: (ctx: { extensionId: string; allow: () => Promise<void> }) => ReactNode;
  },
) {
  const { extensionId } = props;
  const [state, setState] = useState<LaunchState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadExtensionLaunch(extensionId).then(
      (loaded) => !cancelled && setState({ status: 'ready', loaded }),
      (error: unknown) =>
        !cancelled && setState(isConsentRequired(error) ? { status: 'consent' } : { status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
  }, [extensionId, attempt]);

  const failure = state.status === 'error' ? state.error : null;
  // 402 PAYMENT_REQUIRED -> payment wall (no link; checkout is the HOST's flow). 503 ENTITLEMENT_UNAVAILABLE -> retry, never a wall.
  const { wall, wallOverlay, retryAfterSeconds } = useLaunchErrorWall(failure);

  if (state.status === 'loading') return <div className={props.className}>Loading {extensionId}...</div>;

  if (state.status === 'consent') {
    const allow = async () => {
      await installExtension(extensionId);
      setAttempt((n) => n + 1);
    };
    return (
      <div className={props.className}>
        {props.renderConsent ? props.renderConsent({ extensionId, allow }) : <button onClick={allow}>Allow {extensionId}</button>}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={props.className} style={{ position: 'relative', minHeight: props.height ?? 240 }}>
        {wall ? wallOverlay : null}
        {!wall ? (
          <p role="alert">
            {(state.error as Error).message}
            {retryAfterSeconds !== null ? ` (retry in ~${retryAfterSeconds}s)` : ''}
            <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </p>
        ) : null}
      </div>
    );
  }

  return <LaunchedFrame {...props} session={state.loaded.session} launchUrl={state.loaded.launch.launchUrl} />;
}

function LaunchedFrame(props: CommonProps & { session: BridgeSessionConfig; launchUrl: string }) {
  const { session, launchUrl, broker, uiTokens, platformBase, hostDomain } = props;

  // Router: local handler first (add yours), then platform proxy (POST /api/v1/invoke with the launch JWT), then defaults.
  const capabilityRouter = useMemo(
    () =>
      createHostCapabilityRouter({
        platformBase,
        sessionJwt: session.sessionJwt ?? '',
        userId: session.userId,
        hostDomain: hostDomain ?? null,
      }),
    [platformBase, session.sessionJwt, session.userId, hostDomain],
  );

  const { iframeRef, containerRef, containerProps, frameProps, bridgeReady, wallOverlay } = useExtensionEmbed({
    launchUrl,
    allowedOrigin: session.allowedOrigin, // the EMBED origin (sandbox / bundle origin), NOT the host page origin
    session,
    capabilityRouter,
    pubSubBroker: broker, // <- the shared one; without it every iframe is a silo
    uiTokens,
    fillContainer: true,
  });

  return (
    <div
      ref={containerRef}
      className={props.className}
      style={{ ...containerProps.style, height: props.height ?? 320 }}
      data-bridge-ready={containerProps['data-bridge-ready']}
    >
      {!bridgeReady ? <div aria-busy="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} /> : null}
      <iframe
        ref={iframeRef}
        src={frameProps.src}
        title={session.extensionId}
        sandbox={frameProps.sandbox} // from Launch embedPolicy, verbatim; do not widen (security.md rule 11)
        allow={frameProps.allow} // '' = deny-all
        style={frameProps.style}
      />
      {wallOverlay}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Agent-generated HTML / DivKit iframe (embedUrl from compose | extension.present)
// ---------------------------------------------------------------------------------------------

export function AgentGeneratedFrame(
  props: CommonProps & {
    /** Stable per message/tool-call: `${chatId}:${toolCallId}`. Becomes the bridge sessionId (broker key). */
    sessionId: string;
    embedUrl: string;
    /** Optional label, default agent://compose/<sessionId>. */
    extensionId?: string;
    /** Only widen when the generated HTML needs platform:invoke. Default is ['widget.render']. */
    grantedScopes?: string[];
  },
) {
  const { sessionId, embedUrl, extensionId, grantedScopes, broker, uiTokens, platformBase, hostDomain } = props;

  const session = useMemo(
    () =>
      buildAgentGeneratedEmbedSession({
        sessionId,
        embedUrl,
        extensionId,
        grantedScopes,
      }),
    [sessionId, embedUrl, extensionId, grantedScopes],
  );

  // trustClass is 'agent-generated': pubsub works, SENSITIVE / needsScope topics are gated by the broker.
  const capabilityRouter = useMemo(
    () =>
      createHostCapabilityRouter({
        platformBase,
        sessionJwt: '', // agent HTML has no Launch JWT: platform-proxied methods stay unavailable, defaults only
        hostDomain: hostDomain ?? null,
      }),
    [platformBase, hostDomain],
  );

  const { iframeRef, containerRef, containerProps, frameProps } = useExtensionEmbed({
    launchUrl: embedUrl,
    allowedOrigin: session.allowedOrigin, // origin of embedUrl (CMS public base)
    session,
    capabilityRouter,
    pubSubBroker: broker,
    uiTokens, // delivered after the CMS-injected stub posts bridge:hello
    fillContainer: true,
  });

  return (
    <div ref={containerRef} className={props.className} style={{ ...containerProps.style, height: props.height ?? 320 }}>
      <iframe ref={iframeRef} src={frameProps.src} title={sessionId} sandbox={frameProps.sandbox} allow={frameProps.allow} style={frameProps.style} />
    </div>
  );
}
