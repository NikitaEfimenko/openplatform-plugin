/**
 * BROWSER side of Launch. Calls YOUR backend route (createLaunchHandler in platform-server.ts),
 * never the CMS directly with the host token.
 *
 * Rebuilds the error shape that host-bridge expects (`status`, `code`, `entitlement`, `retryAfterSeconds`)
 * so `launchErrorToWall(err)` / `launchRetryFromError(err)` / `useLaunchErrorWall(err)` work unchanged.
 */
import { launchToBridgeSession } from '@finamx/host-bridge';
import type { BridgeSessionConfig, LaunchEntitlement, LaunchResponse } from '@finamx/bridge-protocol';

export type HostLaunchError = Error & {
  status?: number;
  code?: string;
  entitlement?: LaunchEntitlement;
  retryAfterSeconds?: number;
};

export type LoadedExtension = { launch: LaunchResponse; session: BridgeSessionConfig; userId: string };

export async function loadExtensionLaunch(
  extensionId: string,
  opts: { endpoint?: string; version?: string } = {},
): Promise<LoadedExtension> {
  const res = await fetch(opts.endpoint ?? '/api/finamx/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      extensionId,
      version: opts.version,
      hostOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; entitlement?: LaunchEntitlement };
    const err = new Error(body.error ?? `Launch failed: HTTP ${res.status}`) as HostLaunchError;
    err.status = res.status;
    err.code = body.code;
    if (body.entitlement !== undefined) err.entitlement = body.entitlement;
    if (res.status === 503) {
      const raw = Number.parseInt(res.headers.get('Retry-After') ?? '', 10);
      err.retryAfterSeconds = Number.isFinite(raw) ? Math.min(60, Math.max(1, raw)) : 5;
    }
    throw err;
  }
  const { launch, userId } = (await res.json()) as { launch: LaunchResponse; userId: string };
  return { launch, userId, session: launchToBridgeSession(launch, userId) };
}

/** 403 CONSENT_REQUIRED (or legacy "is not installed") -> show consent UI, then install, then retry Launch. */
export function isConsentRequired(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  if ((err as { code?: string }).code === 'CONSENT_REQUIRED') return true;
  return err instanceof Error && /is not installed/i.test(err.message);
}

export async function installExtension(extensionId: string, grantedScopes?: string[], endpoint = '/api/finamx/install'): Promise<void> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ extensionId, grantedScopes }),
  });
  if (!res.ok) throw new Error(`Install failed: HTTP ${res.status}`);
}
