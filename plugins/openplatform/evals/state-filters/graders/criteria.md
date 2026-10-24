---
type: llm
weight: 1
---

A good answer:
- puts the filters into `bridge.state` declared in the manifest as `versions[].surfaces.ui.state` with a JSON `schema` and a `schemaVersion`;
- saves with a debounce and `bridge.state.set(value, { ifVersion })`, merges on `CONFLICT` using `err.current`, applies changes from `bridge.state.onChanged`, migrates a record that arrives with `stale: true`;
- starts from defaults without waiting for the store and keeps working on `NOT_SUPPORTED` (storeless hosts, MCP Apps), catching `InstanceStateError`.
Fail if it stores the filters in the last-value cache (`meta.fromCache`) or recommends it for persistence.
Fail if it omits the schema or `schemaVersion`.
Fail if it treats `NOT_SUPPORTED` as a fatal error that blanks the screen.
