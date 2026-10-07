'use client';
import { useMemo } from 'react';
import {
  CapabilityRouter,
  useExtensionEmbed,
  pubSubBroker,
  ExtensionEmbedFrame,
} from '@finamx/host-bridge';
import type { BridgeSessionConfig, UITokens } from '@finamx/bridge-protocol';

/** Custom chrome — use hook */
export function ExtensionSlot(props: {
  launchUrl: string;
  session: BridgeSessionConfig;
  uiTokens: UITokens;
  userId: string;
}) {
  const capabilityRouter = useMemo(
    () =>
      new CapabilityRouter({
        userId: props.userId,
        invokeHandler: async (request) => {
          if (request.method === 'portfolio.read') {
            return { ok: false, error: { code: 'UNKNOWN_METHOD', message: 'Wire your backend' } };
          }
          return {
            ok: false,
            error: { code: 'UNKNOWN_METHOD', message: `No handler for ${request.method}` },
          };
        },
      }),
    [props.userId],
  );

  const { iframeRef, frameProps, height } = useExtensionEmbed({
    launchUrl: props.launchUrl,
    allowedOrigin: props.session.allowedOrigin,
    session: props.session,
    capabilityRouter,
    uiTokens: props.uiTokens,
    pubSubBroker, // shared singleton for multi-widget
  });

  return (
    <iframe
      ref={iframeRef}
      src={frameProps.src}
      sandbox={frameProps.sandbox}
      style={{ width: '100%', height, border: 0, ...frameProps.style }}
      title={props.session.extensionId}
    />
  );
}

/** Drop-in alternative */
export function SimpleEmbed(props: {
  launchUrl: string;
  session: BridgeSessionConfig;
  uiTokens: UITokens;
}) {
  return (
    <ExtensionEmbedFrame
      launchUrl={props.launchUrl}
      session={props.session}
      uiTokens={props.uiTokens}
    />
  );
}
