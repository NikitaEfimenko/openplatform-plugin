/**
 * Server or client helper — adapt imports to your bundler.
 * extensionId example: com.finamx.crypto-ticker.v2
 */
import { fetchEmbedLaunch, launchToBridgeSession } from '@finamx/host-bridge';

/** Integrity marker (optional on the launch response). */
export type LaunchIntegrityState = 'verified' | 'unverified' | 'approved-by-migration' | 'drift';

/** Thrown for 409 EXTENSION_INTEGRITY_DRIFT: show "temporarily unavailable", do not retry in a loop. */
export class ExtensionIntegrityDriftError extends Error {
  constructor(public readonly extensionId: string) {
    super(`Extension ${extensionId} is temporarily unavailable (integrity drift)`);
    this.name = 'ExtensionIntegrityDriftError';
  }
}

export async function loadExtensionSession(opts: {
  extensionId: string;
  userId: string;
  platformBase: string;
  hostToken: string;
  hostOrigin: string;
}) {
  let launch;
  try {
    launch = await fetchEmbedLaunch({
      extensionId: opts.extensionId,
      hostOrigin: opts.hostOrigin,
      userId: opts.userId,
      platformBase: opts.platformBase,
      hostToken: opts.hostToken,
    });
  } catch (err) {
    const e = err as { status?: number; code?: string };
    if (e.status === 409 && e.code === 'EXTENSION_INTEGRITY_DRIFT') {
      throw new ExtensionIntegrityDriftError(opts.extensionId);
    }
    // 503 INTEGRITY_STATE_UNAVAILABLE: retry after ~5 s (err.retryAfterSeconds), a few times at most
    throw err;
  }
  const session = launchToBridgeSession(launch, opts.userId);
  // 'unverified' / 'approved-by-migration': show a marker, never hide the extension
  const integrityState = (launch as { integrityStatus?: { state?: LaunchIntegrityState } }).integrityStatus?.state;
  // session.requiresIdentityContext — HMAC identity grant
  // session.requiresAuthContext — exchangeCode + redeemUrl on session (host-only)
  return { launch, session, integrityState };
}
