/**
 * SERVER-ONLY helpers (Node 22 / any runtime with fetch). The host token NEVER goes to the browser.
 *
 * Env (as read by @finamx/host-bridge fetchEmbedLaunch):
 *   FINAMX_HOST_TOKEN          Bearer for CMS + MCP (Payload /admin -> Hosts -> Issue key)
 *   FINAMX_PLATFORM_API_BASE   platform base, default https://openplatform.changesandbox.ru
 *
 * Exposes web-standard `Request -> Response` handlers so they mount in Next route handlers,
 * Hono, Express (via adapter), NestJS controllers, etc.
 */
import { fetchEmbedLaunch, resolvePlatformBase } from '@finamx/host-bridge';
import { parseHostDomain, type HostDomain, type LaunchResponse } from '@finamx/bridge-protocol';
import type { GraphEdgeRecord, GraphInstanceRecord } from '@finamx/bridge-protocol';

export function platformBase(): string {
  return resolvePlatformBase().replace(/\/$/, '');
}

export function requireHostToken(): string {
  const token = process.env.FINAMX_HOST_TOKEN?.trim();
  if (!token) throw new Error('FINAMX_HOST_TOKEN is not set (Payload /admin -> Hosts -> Issue key)');
  return token;
}

/** Headers for CMS REST + MCP. X-User-Id is REQUIRED for anything per-user (install, launch, extension.list installed flag). */
export function platformHeaders(userId: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${requireHostToken()}`,
    'X-User-Id': userId,
    ...extra,
  };
}

export type HostSnapshotGraph = { instances: GraphInstanceRecord[]; edges: GraphEdgeRecord[] };

/** GET /api/v1/hosts/self/domain -> { ok, hostId, domain }. Fetch ONCE per session and inject (broker + router). */
export async function getHostDomain(userId: string): Promise<HostDomain | null> {
  const res = await fetch(`${platformBase()}/api/v1/hosts/self/domain`, { headers: platformHeaders(userId) });
  if (!res.ok) return null; // null => absent domain allows nothing (fail-closed); hosts fill their domain from ontology templates
  const body = (await res.json()) as { ok?: boolean; domain?: unknown };
  return body.ok === true && body.domain !== undefined ? parseHostDomain(body.domain) : null;
}

/** GET /api/v1/hosts/self/graph -> { ok, hostId, graph: { instances, edges } } (persistent host graph). */
export async function getHostGraph(userId: string): Promise<HostSnapshotGraph | null> {
  const res = await fetch(`${platformBase()}/api/v1/hosts/self/graph`, { headers: platformHeaders(userId) });
  if (!res.ok) return null;
  const body = (await res.json()) as { ok?: boolean; graph?: HostSnapshotGraph };
  return body.ok === true && body.graph ? body.graph : null;
}

/** GET /api/v1/extensions (Bearer) -> items[].capabilitiesRequested; used to build the consent screen. */
export async function getCapabilitiesRequested(extensionId: string, userId: string): Promise<string[]> {
  const res = await fetch(`${platformBase()}/api/v1/extensions`, { headers: platformHeaders(userId) });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: Array<{ extensionId: string; capabilitiesRequested?: string[] }> };
  return body.items?.find((i) => i.extensionId === extensionId)?.capabilitiesRequested ?? [];
}

type LaunchError = Error & { status?: number; code?: string; entitlement?: unknown; retryAfterSeconds?: number };

/**
 * POST handler: body { extensionId, version?, hostOrigin? } -> 200 { launch, userId } | error JSON
 * Error JSON mirrors the CMS body ({ error, code, entitlement? }) so the browser can rebuild the same
 * error shape that host-bridge `launchErrorToWall` / `launchRetryFromError` expect.
 * Statuses you must surface: 401 HOST_TOKEN_REQUIRED, 403 CONSENT_REQUIRED | EXTENSION_NOT_AVAILABLE |
 * INVALID_HOST_TOKEN | ORIGIN_NOT_ALLOWED, 402 PAYMENT_REQUIRED, 503 ENTITLEMENT_UNAVAILABLE (+Retry-After),
 * 503 EMBED_UI_UNAVAILABLE | SANDBOX_ORIGIN_NOT_CONFIGURED, 429 HOST_TOKEN_RATE_LIMITED.
 */
export function createLaunchHandler(resolveUserId: (req: Request) => Promise<string | null>) {
  return async function POST(req: Request): Promise<Response> {
    const userId = await resolveUserId(req);
    if (!userId) return Response.json({ error: 'Not authenticated', code: 'NO_USER' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { extensionId?: string; version?: string; hostOrigin?: string };
    if (!body.extensionId) return Response.json({ error: 'extensionId is required' }, { status: 400 });
    try {
      const launch: LaunchResponse = await fetchEmbedLaunch({
        extensionId: body.extensionId,
        version: body.version,
        userId,
        hostOrigin: req.headers.get('origin') ?? body.hostOrigin,
        platformBase: platformBase(),
        hostToken: requireHostToken(),
      });
      return Response.json({ launch, userId });
    } catch (err) {
      const e = err as LaunchError;
      return Response.json(
        { error: e.message, code: e.code, ...(e.entitlement !== undefined ? { entitlement: e.entitlement } : {}) },
        {
          status: e.status ?? 502,
          ...(e.retryAfterSeconds ? { headers: { 'Retry-After': String(e.retryAfterSeconds) } } : {}),
        },
      );
    }
  };
}

/**
 * POST handler: body { extensionId, grantedScopes? } -> installs (consent) for the current user.
 * If grantedScopes is omitted the manifest's capabilitiesRequested are granted — only do this AFTER the
 * user saw and accepted the consent screen. Scopes come from the server install record; never from a client.
 * CMS: POST /api/v1/users/me/extensions/{extensionId}/install (Bearer + X-User-Id).
 */
export function createInstallHandler(resolveUserId: (req: Request) => Promise<string | null>) {
  return async function POST(req: Request): Promise<Response> {
    const userId = await resolveUserId(req);
    if (!userId) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { extensionId?: string; grantedScopes?: string[] };
    if (!body.extensionId) return Response.json({ error: 'extensionId is required' }, { status: 400 });
    const scopes =
      body.grantedScopes && body.grantedScopes.length > 0
        ? body.grantedScopes
        : await getCapabilitiesRequested(body.extensionId, userId);
    const res = await fetch(
      `${platformBase()}/api/v1/users/me/extensions/${encodeURIComponent(body.extensionId)}/install`,
      {
        method: 'POST',
        headers: platformHeaders(userId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ grantedScopes: scopes }),
      },
    );
    return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };
}

/** GET handler: current persistent host graph (for hydrating the multi-frame layout on reload). */
export function createGraphHandler(resolveUserId: (req: Request) => Promise<string | null>) {
  return async function GET(req: Request): Promise<Response> {
    const userId = await resolveUserId(req);
    if (!userId) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const [graph, domain] = await Promise.all([getHostGraph(userId), getHostDomain(userId)]);
    return Response.json({ graph: graph ?? { instances: [], edges: [] }, domain });
  };
}
