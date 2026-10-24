# Rounds of questions

Map the idea as a design tree: every decision branches into the decisions that hang off it. Work the tree in
rounds.

## The frontier

The frontier is every decision whose prerequisites are already settled: the questions you can ask now without
guessing at answers you have not heard. Ask the whole frontier in one round, then wait for the answers. A question
whose answer depends on another question still open in this round belongs to a later round.

## Round format

```
Q1 - <question title>: <question body, may be several paragraphs, may list choices>

Recommended: <your recommended answer, with one line on the trade-off>

---

Q2 - <question title>: ...

Recommended: ...
```

Number questions continuously across rounds (Q1..Qn) so the user can refer to them.

## First round for the platform

Ask these together unless the user already answered some:

1. Who uses it, and in which host? (a trader in the host's trading app, an analyst, an agent, the developer only)
2. What does the user see, or does it run headless? (widget, background processor of host topics, MCP tools)
3. Where does the data come from? (neighbour extension topics, host methods, a public API, the user's own backend)
4. What must happen between extensions? (which one publishes what, which one reacts)
5. Which hosts should it run on, now and later?
6. Does the screen have per-user settings (filters, tab, columns, form draft), and must they survive a reload or follow the user to another device? (`bridge.state` with a schema)
7. Who must be able to change them besides the user (the host's agent, your server), and should the agent be able to see them? (an input topic as the command channel, `agentVisible`, BFF or MCP for vendor settings)
8. Which inputs change something important, and which only display? (`acceptFrom: "self"` versus open; how refusals are handled)

Recommended answers come from facts you have already gathered: if one host is visible to the developer, recommend
it; if the data is public and static, recommend a static widget with no backend.
For question 6 recommend `bridge.state` whenever a screen has filters or forms; for 8 recommend `self` only for inputs that change something important.

## Rules

- One round at a time. Wait for answers.
- Facts are yours to find (CLI, files); decisions are the user's. Never answer your own questions.
- The user may answer "as you suggest": record the recommended answer as the decision.
- After each round recompute the frontier: settled decisions unblock the questions that depended on them. Record
  every settled decision in a ticket (see `map-and-tickets.md`).
- Stop when the frontier is empty and the user confirms a shared understanding. Do not write the PRD before that.
