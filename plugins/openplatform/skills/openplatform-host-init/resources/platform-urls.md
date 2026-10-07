# Platform URLs

Shared platform (default). A local platform uses `http://127.0.0.1:3001` (portal/CMS) and `http://127.0.0.1:3100` (MCP).

| Action | URL |
|--------|-----|
| Portal / CMS / Launch API | `https://openplatform.changesandbox.ru` |
| Admin (moderators; host owners issue host keys here) | `https://openplatform.changesandbox.ru/admin` → Hosts |
| JWKS | `https://openplatform.changesandbox.ru/.well-known/jwks.json` |
| Auth-context smoke page | `https://openplatform.changesandbox.ru/auth-context-smoke.html` |
| Platform MCP | `https://openplatform-mcp.changesandbox.ru/mcp` (Bearer host token + `X-User-Id`), `https://openplatform-mcp.changesandbox.ru/health` ungated |
| Developer registration (extension authors) | `https://openplatform.changesandbox.ru/developer/register` |
