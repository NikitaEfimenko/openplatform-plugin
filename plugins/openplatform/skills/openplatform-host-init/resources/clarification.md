# Clarification bank — host init

Ask unanswered items only.

1. **Stack** — Next.js App Router / Pages / Vite React / other.
2. **CMS base** — default `https://openplatform.changesandbox.ru` (local platform `http://127.0.0.1:3001`).
3. **Host identity** — existing `hostId` or create new (`com.<org>.host`).
4. **Host token** — already minted? If no → admin Issue key (see `env-and-token.md`).
5. **Availability** — which `extensionId`s this tenant may see (admin availability join).
6. **Domain** — which templates to insert (fdc3@2.2, finamx-fibo@1, host-ui-basics@1, sandbox-kit@1, canvas-board@1) and/or custom JSON. Empty allows nothing. Which methods does the host serve itself (registerMethod / invoke handler) and does it need s2s pull/push?
7. **Surfaces in this host**
   - Single embed page
   - Multi-widget board + PubSubBroker
   - MCP/agent tools calling catalog
8. **Grants** — none / identity / auth-context / both.
9. **userId source** — real end-user id for launch (never ship POC fallback to prod).
