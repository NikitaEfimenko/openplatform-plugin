---
type: llm
weight: 1
---

A good answer:
- says no to a shared HMAC secret: host identity is a token signed by the host with its own ES256 key (`platform.identity.v1`, `requiresIdentityContext`), and the extension backend verifies it with `verifyHostIdentity` (host public keys plus the platform-signed authorized-issuers document), so the host private key never leaves the host;
- separates the needs: a trusted host user id uses `platform.identity.v1`; the extension's own login uses the extension's own OIDC or backend popup flow, and the host `sub` must not be linked to or used as an account automatically;
- says `platform.auth_context.v1` is only a launch attestation with no user and is not SSO, and that user-bound s2s (`platform.s2s.user.v1`) is for host data, not identity;
- says that only the identity token or auth-context exchange grant reaches the iframe through `widget.identity.grant`, and that Core or gateway access tokens and the Launch session token never enter the iframe (the extension's own login yields only an opaque app session from a popup).
Fail if it recommends HMAC or any shared-secret identity.
Fail if it puts a Core, gateway or Launch session token into the iframe.
Fail if it treats auth-context as SSO or as a user identity.
