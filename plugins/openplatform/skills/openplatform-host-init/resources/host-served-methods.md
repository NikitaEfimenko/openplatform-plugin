# Serve methods, publish topics, s2s (host 2.0)

Declaring a method in the domain only allows it. The host must **serve** it. Never invent portfolio or account data: a stub must be labelled and must refuse in production.

## Browser side: router.registerMethod

```ts
import { createHostCapabilityRouter, PubSubBroker } from '@finamx/host-bridge';
import type { HostDomain } from '@finamx/host-bridge';

const pubSubBroker = new PubSubBroker(); // one per screen, shared by every embed
export function makeRouter(userId: string, domain: HostDomain) {
  pubSubBroker.setHostDomain(domain);
  const router = createHostCapabilityRouter({
    userId,
    hostDomain: domain,
    methods: {
      'market.quote': async ({ params }) => myApi.quote(String(params.symbol)),
    },
  });
  // equivalent: router.registerMethod('portfolio.summary', async ({ params, session }) => ...)
  return router;
}
```

`router.canInvoke(method, session.grantedScopes)` is the domain check (declared + scope granted). `registerMethod` returns an unregister function. Methods outside the domain or without a granted scope are denied before the handler runs.

## Publish host data

```ts
pubSubBroker.publishTopic('fdc3.instrument', { type: 'fdc3.instrument', id: { ticker: 'SBER' } });
```

Validated against the topic schema in the domain; delivery obeys the consent matrix. Throws `TOPIC_UNDECLARED` for topics the domain does not declare (`publishTopic` publishes host-domain topics only). Extension-owned topics from `launch.extensionTopics` pass the broker between extensions without host consent; the host does nothing beyond passing the session from `launchToBridgeSession`.

## Server side: authorize, then serve

Extension iframes call `POST /api/v1/invoke/authorize` through your server (the host holds its Bearer key). `@finamx/host-bridge/server` (Node only, never import it from client code):

```ts
import {
  createCmsPlatformClient, createHostInvokeHandler, hostResult,
  HostMethodNotImplementedError,
} from '@finamx/host-bridge/server';

const client = createCmsPlatformClient({
  cmsBase: process.env.FINAMX_PLATFORM_API_BASE!,
  hostToken: process.env.FINAMX_HOST_TOKEN!,
});

export const handleInvoke = createHostInvokeHandler({
  client,
  methods: {
    'market.quote': async ({ userId, params }) => myApi.quote(userId, String(params.symbol)),
    'portfolio.summary': async () => {
      if (process.env.NODE_ENV === 'production') {
        throw new HostMethodNotImplementedError('portfolio.summary is a stub');
      }
      return hostResult({ _mock: true, name: '[MOCK] Demo portfolio' });
    },
  },
});
// route: const res = await handleInvoke({ launchToken, method, params, sessionId, currentUserId });
//        return Response.json(res.body, { status: res.status, headers: res.headers });
```

Flow per call: `client.authorize` (CMS checks session, scope, consent, licence, entitlement and writes the audit row) -> your method -> `client.complete` (audit result). `currentUserId` must come from your own session, not the request body. A method without an entry answers `NOT_IMPLEMENTED`.

## s2s (user-bound, `platform.s2s.user.v1`)

Admin: set `Hosts.s2s.enabled` and `Hosts.s2s.methodEndpointUrl` (absolute https). CMS mints tokens only after the user's consent; `S2S_USER_HANDLE_SECRET` must be set in production.

Pull (the extension backend calls you). Mount the endpoint at `methodEndpointUrl`:

```ts
import {
  createVerifyUserBoundS2s, createHostS2sEndpoint, createCachedDomainLoader,
} from '@finamx/host-bridge/server';

const verify = createVerifyUserBoundS2s({
  jwksUrl: `${process.env.FINAMX_PLATFORM_API_BASE}/.well-known/jwks.json`,
  hostId: 'com.acme.host',
}); // one instance per process: JWKS cache + jti replay set
export const handleS2s = createHostS2sEndpoint({
  verify,
  methods: sameMethodsAsInvoke,
  domainLoader: createCachedDomainLoader(() => client.getHostDomain()),
});
// POST handler: const out = await handleS2s({ authorization: req.headers.get('authorization') ?? undefined, body: await req.json() });
```

The token has `aud: host:<hostId>`, `dir: pull`, `sub` = your own user id for that user, `scope` = computed from your domain. The endpoint re-reads the required scope from your current domain, never from the caller.

Push (you deliver a topic to the extension backend):

```ts
import { pushTopic } from '@finamx/host-bridge/server';

await pushTopic({ client, extensionId, userId, topicType: 'fdc3.instrument', payload, domain });
```

CMS returns both the token and the destination (the extension's stored webhook URL); the caller never supplies a URL. No redirects, 5 s timeout. Push `sub` is a pairwise handle (`uh_...`), also returned by Launch as `s2sUserHandle`.

## Rules

- Never put tokens, `exchangeCode`, identity context or the host key on a topic.
- Server kit stays server-side; the browser entry (`@finamx/host-bridge`) does not import it.
- Server helpers ship as `@finamx/host-bridge/server`; a NestJS reference host exists at FinamX, ask the platform team for access.
