---
type: llm
weight: 1
---

A good answer:
- sets `acceptFrom: "self"` on the own input topic `com.acme.ticket.prefill` in `surfaces.topics.subscribes[]` (it changes something important), and leaves the display-only `highlight` input open (`any`), explaining that closing every input breaks boards built from several vendors;
- says host events always pass, a refused sender gets `SENDER_NOT_ACCEPTED` only through `bridge.context.onPublishRejected`, and the receiver sees nothing;
- may offer the soft alternative: accept all, apply `meta.relation` self (and absent, a host event) silently and offer `other` to the user as a suggestion;
- says the platform does not reveal who the sender is, so there is no per-partner logic.
Fail if it treats a missing `relation` as `other`.
Fail if it closes both inputs with `self` without distinguishing them.
Fail if it proposes to learn or match the sender's extensionId.
