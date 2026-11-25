# Flow V2 extension steps

Choose Flow V2 when the program must run while the board is closed. Use live Bridge topics for interactive wiring. An extension may offer both surfaces with separate contracts.

## Register the BFF

1. Confirm the target host exposes Flow V2, the execution owner, and the host's exact method names and grants. For the platform owner, the callback is the trusted CMS HTTPS origin plus `/api/v2/flow/complete`.
2. Declare a concrete S2S request topic, the reviewed HTTPS POST webhook at `versions[].surfaces.topics.s2sChannels.webhook.url`, and concrete schema-backed outputs. Agree on the input schema for the Flow V2 envelope and set `replyTopicType` on the subscription to the exact declared output topic. The platform compiler uses that topic name as the output port. Pin extension version, schema version and hashes when compiling the program.
   See the [headless holdings manifest](../examples/holdings-manifest.json).
3. Deploy the BFF, submit its webhook URL in the version manifest, and register the public key with `finamx-ext s2s register --public-jwk .secrets/finamx-s2s/s2s-public.jwk.json` once the extension record exists. Published-key rotation remains moderator-managed. Follow [key setup](user-bound-s2s.md). Check the approved version's route, key, host availability, licence and consent before scheduling.

## Receive, process and complete

| Boundary | Responsibility |
|---|---|
| HTTPS webhook | Use `createS2sWebhookHandler` with `profile: 'user'`. Handle JSON-RPC `topics/publish` on the concrete request topic. Compare RPC ID and payload `invocationId`. The payload carries `invocationToken`, `executionContextRef` and `inputRefs`. |
| Invocation verification | Use `verifyFlowStepInvocation(token, { expected, trust })` with the registered owner’s invocation-signing authority and exact callback URL/audience from trusted server configuration. For the platform owner use its CMS invocation-signing keys from the trusted portal’s `/op/jwks`, never `/host/jwks` or an aggregate source. Obtain expected host, owner, principal, activation, generation, program revision, extension/version and invocation from authorized run context. Never derive the expectation or trusted keys and URL by decoding the incoming token. |
| Queue | Persist before acknowledging JSON-RPC receipt. Deduplicate by invocation and its owner/run binding. Repeated delivery must recover the same job. Keep capabilities in protected server storage and out of logs. Set a byte limit in the HTTP adapter before buffering the incoming request. |
| Worker | Read saved config and input refs through the host's declared, consent-gated methods. Compute the output; validate it against the pinned schema and save it with the authorized artifact writer. Keep business data out of workflow history. |
| Completion | Call `completeStep` with the verified context, refs-only outcome and a fresh audience-bound sender credential. A successful completion is HTTP 200 with protocol `finamx.flow.completion.v2`, `ok: true` and the matching invocation ID. Receiving the job and completing it are separate events. |

Use the SDK's `requestUserS2sToken` and `callHostMethod` per declared method, with the user handle from verified context and the CMS-returned endpoint. For the reference strategies host these methods include `flow.v2.context.read({ invocationId })` (grant `flow.context`), `flow.v2.artifact.read({ invocationId, port, ref })` and `flow.v2.artifact.write({ invocationId, port, body })` (grant `flow.artifacts`). Check the pulled host domain before using those names on another host.

The [small TypeScript completion example](../examples/complete-holdings.ts) signs with the extension's registered key. A multi-output step supplies a ref for every declared port. Use `empty` for an explicit empty business result and `error` with an agreed safe code and retryability for a failed step. Persist the chosen outcome across BFF restarts. When acknowledgement is lost, retry the same outcome with fresh sender authentication against the same owner. For work beyond the capability TTL, use the owner-authorized refresh for the same pending invocation. The platform exposes `POST /api/v2/flow/invocations/{invocationId}/token`. Reverify the refreshed token before use. Cancelled or superseded invocations must remain fenced.

## Worked strategy program

AlphaBuilder Strategies reads the saved model portfolio ID and publishes a validated `holdings` artifact. A parallel source reads a dedicated paper account snapshot. Mapper joins those two references and emits a rebalance proposal or a no-trade reason. Paper Execution owns order effects and deduplication. A report Mapper combines the snapshot and execution result. Delivery sends the owner's Telegram report.

Start with AlphaBuilder alone. Check webhook receipt → durable job → context read → artifact write → owner ACK → artifact in run history. A run in `waiting` after HTTP 2xx proves transport receipt only. Correlate by invocation ID, topic, job state and response codes. Repeat delivery and restart the BFF during a run, then test expired capability, cancelled activation, stale/missing data and an incompatible pinned schema. Verify the joined chain with paper execution before enabling a schedule, and verify a scheduled run with the board closed. The recorded AlphaBuilder smoke run reached waiting; the end-to-end AlphaBuilder chain still requires its own acceptance run.
