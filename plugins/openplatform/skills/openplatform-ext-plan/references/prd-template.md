# PRD.md layout

Write `docs/prd/<slug>/PRD.md` with these sections, in this order. Keep it short; link tickets for the reasoning.

```markdown
# <Product name>

## Summary
<two or three sentences: what the user gets and why>

## Users and hosts
<who uses it, in which hosts; hosts by hostId>

## Extensions
| extensionId | Kind and surfaces | Purpose | Hosts |
|---|---|---|---|
| com.<you>.<slug> | widget (ui) / headless (topics) / MCP (tools) | ... | ... |

### <extensionId>
- Topics published: `<extensionId>.<name>` with the JSON Schema below
- Topics subscribed: host topics (no schema of yours) and neighbour topics
- Host methods: `<method>` with `requiredScope`
- capabilitiesRequested: <list, only what is needed>
- Data sources and secrets: <public API, host methods, own backend; a backend only when an own secret exists>
- Delivery: artifact upload (recommended) or hosted URL

```json
{ "type": "object", "properties": {}, "required": [] }
```

## Links
| From (extension.topic) | To (extension) | Payload schema |
|---|---|---|

## Reused catalog extensions
<existing extensions used or linked, with the topics relied on>

## Open questions
<links to open tickets and entries under "Not yet specified">

## Out of scope
<copied from MAP.md>

## Next step
openplatform-ext-init for <first extensionId>
```

Rules for the content: own topics are named `<extensionId>.<name>` and carry a JSON Schema; host topics are
declared in the host domain and carry none from you; every host method lists the scope it needs; every extension
appears in the Links table or is explicitly standalone.
