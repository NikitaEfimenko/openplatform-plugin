---
type: llm
weight: 1
---

- Identifies the target host and uses `hosts`, `domain pull` and `context` to discover the real methods and scopes. Uses conditional examples when those facts are unavailable.
- Asks about owner and trigger, then resolves pinned S2S request/reply schemas, grants and data freshness.
- Orders the flow as model and paper snapshot → proposal → paper execution → report and delivery.
- Explains that webhook receipt and completion require distinct evidence and identifies the traces to collect.
- Uses verified invocation context, artifact refs, a fresh Bearer assertion for the callback audience and Flow V2 ACK.
- Covers duplicate delivery, cancellation and a manual source-only test before scheduling.
- Gives an ordered next action and acceptance evidence at each handoff. Starts from the first missing evidence for the waiting run without asking the user to rebuild the board.
