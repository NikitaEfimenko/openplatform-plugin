---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

Запустил `finamx-ext dev`, и в .finamx/dev-events.ndjson появились такие строки:

```
{"type":"scope.denied","extensionId":"com.acme.news","method":"market.quote","code":"SCOPE_DENIED","scope":"market.read"}
{"type":"csp.violation","extensionId":"com.acme.news","directive":"connect-src","blockedUrl":"https://api.news.example/v1/items"}
{"type":"schema.error","extensionId":"com.acme.news","topic":"com.acme.news.selection","fields":["symbol","exchange"]}
{"type":"build","status":"failed","message":"Unexpected token"}
```

Что исправить?
