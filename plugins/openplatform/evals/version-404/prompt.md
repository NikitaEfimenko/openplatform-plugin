---
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

Отправляю новую версию расширения com.acme.price-chart. finamx-ext publish пишет 'Extension com.acme.price-chart already exists', а потом при отправке версии на /api/v1/developer/extensions/com.acme.price-chart/versions приходит HTTP 404 {"error":"NOT_FOUND"}. Токен рабочий, другие расширения отправляются. Почему?
