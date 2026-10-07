# Declare the host domain

The host domain (topics, methods, consent matrix) lives on the host record in the platform. It is written in the
portal admin and read through the API; there is no public write endpoint.

1. `https://openplatform.changesandbox.ru/admin` → **Hosts** → your host.
2. **Template insert** panel: insert the templates you need (`host-templates.md`), dry run first, then apply.
   Merge is host-wins: entries the host already declares are kept.
3. Add host-specific topics and methods in the **domain** JSON field (shape: `host-domain.json`), save.
   Malformed JSON Schema in `topics[].schema` is rejected at save.

If you do not have admin access to your host record, send the domain JSON and the template list to the platform team.

Read back:

```bash
curl -H "Authorization: Bearer $FINAMX_HOST_TOKEN" https://openplatform.changesandbox.ru/api/v1/hosts/self/domain
```

MCP: `get_host_domain` (no args, same Bearer).

## Runtime wiring

Fetch **once** at session init:

```ts
pubSubBroker.setHostDomain(domain);
createHostCapabilityRouter({ userId, hostDomain: domain, /* ... */ });
```

Never fetch per publish/invoke (hot path).

## Authority

There are no defaults to replace: an empty domain allows nothing. Topic missing from non-empty `consentMatrix` → `needsScope` (fail-closed). `ui.toast` is a declared method: insert `host-ui-basics@1`, otherwise toasts are denied.
