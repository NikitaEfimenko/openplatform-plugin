# MCP Apps sandbox proxy page (host-supplied; UNVERIFIED in a browser by this skill)

`experimental_MCPAppRenderer` (`@ai-sdk/react` 4.x) renders `<iframe src={sandbox.url} sandbox="allow-scripts allow-same-origin allow-forms">` and speaks JSON-RPC 2.0
to it. Contract read from `node_modules/@ai-sdk/react/src/mcp-apps/app-frame.tsx` + `bridge.ts` (protocol from the ext-apps spec):

1. The proxy page (served from an ORIGIN DIFFERENT from the host app; `deriveTargetOrigin(sandbox.url)` is used as `postMessage` target and as `event.origin` filter) loads and posts to `window.parent`:
   `{ "jsonrpc": "2.0", "method": "ui/notifications/sandbox-proxy-ready" }`.
2. The host answers `{ jsonrpc, method: "ui/notifications/sandbox-resource-ready", params: { html, csp, sandbox, allow } }`.
   `csp` is built by `getMCPAppCSP` (`default-src 'none'; script-src 'unsafe-inline'; connect-src 'self' <https connectDomains>; frame-src 'self' <https frameDomains>; ...`,
   non-https origins are dropped); `sandbox` defaults to `allow-scripts allow-forms` (opaque origin); `allow` only for permissions that are both requested by the resource and in `sandbox.allowedPermissions`.
3. The proxy creates an inner `<iframe srcdoc=html sandbox=params.sandbox allow=params.allow>` with the CSP applied (inject `<meta http-equiv="Content-Security-Policy" content=csp>` at the top of `html`).
4. From then on the proxy relays every JSON-RPC message inner -> parent and parent -> inner unchanged (view requests such as `tools/call` reach the host bridge; results and
   `ui/notifications/tool-input|tool-result` flow back).

Minimal proxy body (write it, host it statically on the sandbox origin, no cookies, no CMS routes):

```html
<!doctype html><meta charset="utf-8">
<script>
  var inner = null;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (e.source === window.parent) {
      if (d && d.method === 'ui/notifications/sandbox-resource-ready') {
        var p = d.params || {};
        inner = document.createElement('iframe');
        inner.setAttribute('sandbox', p.sandbox || 'allow-scripts allow-forms');
        if (p.allow) inner.setAttribute('allow', p.allow);
        var meta = p.csp ? '<meta http-equiv="Content-Security-Policy" content="' + p.csp.replace(/"/g, '&quot;') + '">' : '';
        inner.srcdoc = meta + p.html;
        inner.style.cssText = 'border:0;width:100%;height:100%';
        document.body.appendChild(inner);
      } else if (inner) inner.contentWindow.postMessage(d, '*');
    } else if (inner && e.source === inner.contentWindow) {
      window.parent.postMessage(d, '*'); // tighten '*' to the host origin in production
    }
  });
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/sandbox-proxy-ready' }, '*');
</script>
```

Status: the message names/params are read from the SDK source; this HTML page was not run in a browser here. Verify against the platform harness
(`bash scripts/compat-mcp-apps.sh --live`, needs a running stack) before shipping. Sizing: listen for `onSizeChange` in `handlers`.
