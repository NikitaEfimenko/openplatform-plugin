---
type: llm
weight: 1
---

A good answer:
- says the key must not come from the request body: the widget can forge any field, so `userId` and `instanceId` from the body are unsafe;
- tells the widget to send the `platform.auth_context.v1` token (`resolveAuthContext`, `ctx.redeem.token`) as Bearer, the backend to verify it with `verifyPlatformClaim` and to build the key with `authContextStateKey(claims)` (`host`, pairwise `uh_` `sub`, `instanceId`), answering 403 when it returns null;
- says the user key needs `hostBridge.requiresUserKey` (or a declared `surfaces.ui.state`) and SDK 3.5.0 or newer;
- tells to handle `consent/revoked` with `createS2sWebhookHandler({ onConsentRevoked })`, idempotently, deleting the data of that (host, handle) pair.
Fail if it keeps keying by ids from the body or by the host user id.
Fail if it says the `sub` of auth-context is the host user id.
