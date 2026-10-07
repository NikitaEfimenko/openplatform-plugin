# MCP catalog tools

Endpoint: `https://openplatform-mcp.changesandbox.ru/mcp` (local platform `http://127.0.0.1:3100/mcp`)  
Auth: `Authorization: Bearer <FINAMX_HOST_TOKEN>`  
`/health` ungated.

| Tool | Role |
|------|------|
| `extension.list` | Registry extensions for **this** host (availability-gated) |
| `extension.get` | One extension |
| `extension.install` | Consent / grantedScopes |
| `extension.schema` | Schema / agent metadata |
| `extension.present` | Present UI (`extensionId` **or** DivKit `slug`) |
| `divkit.list` / `divkit.get` | Built-in DivKit slug catalog — **not** Registry |
| `get_host_domain` | This host's domain |
| `capability.list` | Platform capabilities |
| `graph.*` | Graph tools (board instances and edges) |

Old names (`list_widgets`, `list_extensions`, `widget.render`, …) — **removed, no aliases**.

Headless extensions omit `surfaces.ui` — cannot embed; may still appear in list for tools/topics.
