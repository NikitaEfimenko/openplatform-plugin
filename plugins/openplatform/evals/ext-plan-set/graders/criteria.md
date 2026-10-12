---
type: llm
weight: 1
---

A good answer:
- starts with a round of numbered questions, each with a recommended answer (or states its assumptions with recommendations), and writes no code yet;
- proposes to check what already exists with `finamx-ext catalog --json`, `finamx-ext hosts --json` and `finamx-ext domain pull <hostId>` before deciding;
- proposes a split into several extensions with extensionIds like com.<you>.<slug> (screener, chart, news);
- links them through the host topic `fdc3.instrument` (referenced without a schema): screener -> chart -> news;
- gives own topics the name `<extensionId>.<name>` with JSON Schemas, and takes host methods and their scopes from the pulled domain instead of inventing them;
- says the decisions are saved in `docs/prd/<slug>/` (map, tickets, PRD.md) and that each extension then goes to openplatform-ext-init;
- never asks for a host key or token.
Fail if it scaffolds the code of a single widget immediately, or invents host methods without pulling the domain.
