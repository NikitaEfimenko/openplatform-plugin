# Map and tickets (local markdown)

The record of the planning session lives in the author's project, next to the PRD.

```
docs/prd/<slug>/
  MAP.md
  tickets/
    01-<kebab-name>.md
    02-<kebab-name>.md
  PRD.md            (written at the end)
```

## MAP.md

The map is an index: it gists decisions and links the ticket that holds the detail. A decision lives in exactly one
place, its ticket.

```markdown
## Destination
<what reaching the end looks like: the PRD for which product, for which hosts. One or two lines.>

## Notes
<domain facts, standing preferences>

### Glossary
- **<term>**: <the settled meaning>

## Decisions so far
- [<closed ticket title>](tickets/NN-name.md): <one-line gist of the answer>

## Not yet specified
<in-scope fog you cannot ticket yet; graduates into tickets as the frontier advances>

## Out of scope
<work ruled out of this effort, with the reason; never graduates>
```

Open tickets are not listed in the map: they are the files with `status: open`.

## Tickets

Each file has frontmatter and a question:

```markdown
---
title: <short name of the decision>
type: grilling
status: open
assignee:
blocked-by: []
---

## Question

<the decision this ticket resolves>
```

- `type`: `grilling` (default, a conversation with the user), `research` (a fact outside the project, resolved by
  you alone), `prototype` (when "how should it look" is the question: make a rough artifact to react to), `task`
  (manual work that unblocks a decision, for example running `finamx-ext login`).
- `status`: `open` or `closed`. `assignee`: who claimed it. `blocked-by`: list of ticket file names.
- One decision per ticket, sized to one short exchange.

When a decision lands: add a section `## Resolution (YYYY-MM-DD)` with the answer, set `status: closed`, add one
line to "Decisions so far".

## Rules

- Refer to tickets by their title in what the user reads, not by number alone.
- The frontier is the open, unblocked, unclaimed tickets.
- Fog or ticket: if you can state the question precisely now, make a ticket (even if it is blocked); otherwise it
  goes under "Not yet specified".
- If a ticket turns out to be past the destination, close it and add one line under "Out of scope" with the reason.
