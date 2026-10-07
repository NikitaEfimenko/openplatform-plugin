---
type: llm
weight: 1
---

A good answer:
- says no: the widget bundle is public and reviewed, so a secret must not be built into it, put into manifest, topics or logs;
- recommends a small backend (BFF) that holds the key, declared in surfaces.ui.csp.connect, with CORS;
- recommends authenticating widget calls to the backend with the platform auth context (hostBridge.requiresAuthContext + auth.context scope, resolveAuthContext in the widget, verifyPlatformClaim on the server) instead of a shared key;
- mentions the backend origin needs moderator approval.
Fail if it suggests embedding the key in the bundle or the manifest.
