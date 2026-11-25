---
type: llm
weight: 1
---

- With authorized CLI access, runs `hosts --json`, `domain pull <hostId> --json`, and `context <hostId>` before relying on host methods or scopes. Without access, includes all three copyable `finamx-ext` commands in the first response and says how to pick the host ID. Merely saying to check the host domain does not meet this criterion.
- Uses exact methods, schemas and scopes only when grounded in the selected host domain. Labels examples as conditional when the domain is unavailable.
- Asks about owner and trigger, then resolves pinned S2S request/reply schemas, grants and data freshness.
- Orders the flow as model and paper snapshot → proposal → paper execution → report and delivery.
- Explains that webhook receipt and completion require distinct evidence and identifies the traces to collect.
- Uses verified invocation context, artifact refs, a fresh Bearer assertion for the callback audience and Flow V2 ACK.
- Covers duplicate delivery, cancellation and a manual source-only test before scheduling.
- Gives an ordered next action and acceptance evidence at each handoff. Starts from the first missing evidence for the waiting run without asking the user to rebuild the board.

- Explains Flow as a saved sequence of extension actions that can continue with the board closed. Reuses known decisions; asks whether step support or a particular assembled program is wanted only when unresolved.
- Uses public-only CLI key registration after record creation, checks the CLI/CMS release dependency, and carries backend, consent, key setup and end-to-end acceptance into implementation tasks.
