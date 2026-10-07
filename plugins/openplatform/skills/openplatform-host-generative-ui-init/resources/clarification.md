# Clarification bank (ask only what discovery could not answer; Russian is fine)

Discovery first (see `discovery.md`), then confirm in ONE message with defaults filled in:

```
Нашёл чат: <файл/маршрут>, стек <AI SDK useChat | свой SSE | другое>, LLM-вызов на <сервер/клиент>.
1. Где рендерить результаты — прямо в ленте чата (inline), в боковой панели, или на «доске»/канвасе?
2. Нужно несколько расширений на одном экране со связями между ними (graph.*), или достаточно по одному в сообщении?
3. Кто у вас end-user id для X-User-Id и Launch? (сессия/JWT — откуда его брать на сервере)
4. Host token уже выпущен? (Payload /admin → Hosts → Issue key) Extensions включены для host (availability)?
5. Нужен ли MCP Apps (стандартный протокол, ui://) или достаточно нативного Launch + host-bridge? (по умолчанию: нативный)
6. Consent: показываем свой экран согласия или пусть агент спрашивает в чате и вызывает extension.install?
7. Заполнен ли домен host (topics/methods/consent) шаблонами? Словарь compose/graph.* = топики, которые host сам объявил; пустой домен не разрешает ничего (никаких встроенных топиков).
```

External chat clients (answer B/C to «Что создаём?»):
```
8. Свой OAuth 2.1 / OIDC у хоста есть? Если нет — ставим (например Better Auth OIDC/MCP-плагин). Какой claim = id пользователя?
9. URL MCP-endpoint хоста (станет audience токенов) и где он будет хоститься (HTTPS обязателен)?
10. Свои бизнес-tools рядом с платформенными? (имена не должны пересекаться с present_*, finamx_*, extension.*)
11. Какие extension показать в чатах? Есть ли у них single-file MCP App-версия (иначе текстовый ответ в клиентах без вложенных фреймов)?
12. Согласие: на экране OAuth-согласия хоста или отдельной страницей? (не через extension.install от модели)
13. Тест до OAuth: UAT-режим на sandbox-хосте (запрашивается у команды платформы) — кто выдаёт ключ sandbox-хоста?
```
Defaults for B: relay mode (host MCP server + host OAuth), EXTERNAL_CLIENT_TOOLS allowlist, consent on the host's OAuth screen,
UAT on a dedicated sandbox host before OAuth is ready.

Defaults if the user does not answer: inline rendering, one UI per message, native Launch (no MCP Apps), consent via host button,
host domain fetched once at session init, shared broker per conversation.

Never ask for the host token value in chat: tell the user where to put it (`FINAMX_HOST_TOKEN` in the server env, gitignored).
