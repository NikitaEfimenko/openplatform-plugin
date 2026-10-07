---
type: llm
weight: 1
---

A good answer:
- recommends uploading the built dist/ as an artifact (finamx-ext publish --artifact-dir dist, or the publish script) as the easiest path, with no hosting needed;
- explains that with an artifact the platform runs exactly the uploaded files (pinned by sha256) and never fetches from the developer's server;
- explains that embedBundleUrl is downloaded once at submit and frozen as an artifact, so later changes on the server are ignored (and it must answer 200 without redirects);
- says a live link that runs from the developer's server is only for FinamX first-party/admin submissions and needs domain approval with an integrity monitor;
- mentions the developer token (FINAMX_DEV_TOKEN from the portal dashboard) without asking to paste it into chat.
Fail if it claims the platform loads the widget from the developer's server on every launch for a normal third-party submission.
