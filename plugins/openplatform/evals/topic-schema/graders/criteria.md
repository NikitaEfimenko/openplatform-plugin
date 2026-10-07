---
type: llm
weight: 1
---

A good answer:
- explains the topic ownership rule: own topics must be named <extensionId>.<name> (com.acme.screener.selection) and carry a JSON schema; any other name is a host topic reference and must not carry a schema;
- tells to remove the schema from finamx.filter and rename acme.selection to com.acme.screener.selection (keeping its schema), and update subscribers;
- says to resubmit (a newer submission of a pending version replaces it).
Fail if it blames the moderator or the token.
