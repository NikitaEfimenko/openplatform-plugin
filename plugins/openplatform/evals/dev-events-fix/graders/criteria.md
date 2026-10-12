---
type: llm
weight: 1
---

A good answer maps each event to a concrete fix:
- `SCOPE_DENIED` for market.quote: add `market.read` to versions[].capabilitiesRequested (and grant consent again on the dev board if it was revoked);
- csp.violation on connect-src: add the bare origin https://api.news.example (no path, no wildcard) to surfaces.ui.csp.connect, and mention that the origin needs moderator review;
- schema.error on com.acme.news.selection: fix the publisher payload or the own topic schema according to the listed fields (symbol, exchange);
- build failed: fix the syntax error and rebuild;
- then re-runs `finamx-ext check` and watches for new events;
- does not publish to test the fix.
Fail if it suggests disabling CSP, wildcards in csp, or publishing to test.
