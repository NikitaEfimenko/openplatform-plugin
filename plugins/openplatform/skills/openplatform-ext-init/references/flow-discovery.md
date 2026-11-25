# Help the developer choose whether to support Flow V2

Use this guide in both extension planning and implementation, even if the developer never says “Flow”.
Speak their language. Explain one concept at a time; never start by asking them to choose protocols or key formats.
Reuse a decision already made in the PRD instead of asking again.

## Explain, then offer a choice

Example explanation in Russian (adapt the example to their idea):

> Flow-программа — это сохранённая последовательность действий из расширений. Например: каждое утро получить
> состав портфеля → посчитать изменения → подготовить отчёт → отправить уведомление. Хост запускает её вручную,
> по событию или по расписанию, следит за выполнением шагов и сохраняет ход запуска. Программа может работать,
> когда доска закрыта. Ваше расширение может выполнять один из таких шагов; саму программу собирают в хосте,
> который поддерживает Flow V2.

Then ask: “Хотите, чтобы ваше расширение можно было использовать как шаг такой программы?”
Offer two choices with the contextual recommendation first:

- **Yes:** other extensions can use its result in background programs; requires a deployed backend and extra checks.
  Recommend this when the idea needs a schedule, long processing, or work while the page is closed.
- **No, only while the screen is open:** start with an ordinary widget and live topic connections. Recommend this
  for a display, chart or simple interactive tool. No Flow backend or key setup is needed solely for this choice.

“Not sure” is a valid answer: show one concrete example for their idea and resolve whether it must continue with
its screen closed. “As you suggest” accepts the recommendation. An explicit “no” closes this branch; do not keep
selling automation. Backend S2S data access may still need a key independently of Flow.

## Guide one decision at a time

1. **First useful result.** Ask what one step receives and produces, in everyday terms: “Get portfolio → return a
   table of holdings”. Suggest a minimal source-only run before a whole chain. The agent translates that into
   concrete request/reply topics and schemas after checking the real host domain.
2. **Who starts it.** Ask which app should run the program and when. Discover hosts with `finamx-ext hosts --json`,
   pull the chosen domain and inspect its context. Recommend a manual run first. If the host lacks Flow support
   or required methods, name the host-owner dependency; templates do not prove availability.
3. **Data and consequences.** Ask whose data is used and whether the step only calculates or also places orders,
   sends messages or changes records. Explain consent as “the user allows this app to read these data”. Find
   catalog extensions that already do a needed step; show reusable candidates with verified contracts.
4. **Where it runs.** Explain a backend as “a service that stays running when the browser is closed”. Detect the
   current deploy and suggest an operator/deploy route. Explain that closing the page does not run browser code
   in the background. Agree on the operator, HTTPS webhook and durable job storage before implementation.
5. **Connect safely.** Explain the key pair as “a secret signature kept on your server and a public key the platform
   uses to recognise it”. Use [the CLI key setup](user-bound-s2s.md), not a request to paste secrets. Submit the
   version/webhook, register the public key, confirm host access and consent. Report a deployment/API dependency
   honestly; registration is not proof of moderation or host readiness.
6. **Prove it works.** Show the checkpoints: request received → job saved → result saved → host confirms completion.
   Verify one result in run history, duplicate delivery, service restart and cancellation, then a run with the board
   closed. Add a schedule only after that proof. Explain failures by the next missing checkpoint.

Each round: state what is already known, recommend a decision with a short reason, ask only unresolved dependent
questions, wait for the answer, then update the plan/ticket. Keep jargon and implementation detail in the artifact
for the implementing agent; describe the user-facing decision plainly.

## Carry the decision into the work

Record **Flow: yes / no / undecided**, the reason and the first example in the plan card and each extension's PRD.
For “yes”, create actionable tickets/tasks with an owner, dependencies and observable acceptance:

- host discovery and confirmed execution owner/trigger;
- source step, request/reply schemas, pinned version and compatible catalog neighbours;
- backend deployment, durable deduplication, consent and minimal scopes;
- CLI key generation, private-key secret deployment and public-key registration (moderator rotation if needed);
- Flow V2 invocation verification, artifacts and completion acknowledgement;
- one manual run, duplicate/restart/cancel checks and closed-board run; scheduling afterwards if requested.

Separate “make this extension usable as a step” from “assemble and activate a particular program”. Plan the latter
only when requested and supported by the host. For “no”, record it explicitly and omit Flow-only implementation
tasks. Never add a new manifest kind or invent host methods. Technical walkthrough: [program quickstart](program-quickstart.md).
