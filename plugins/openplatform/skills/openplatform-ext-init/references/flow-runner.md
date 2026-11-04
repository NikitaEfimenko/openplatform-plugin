# Flow Runner: durable graphs of extension steps

Use this when a host needs a scheduled or triggered workflow across extension instances. Ordinary `bridge.context` topics are live, ephemeral events; they do not resume a parked run. A Flow Runner step is a server-to-server JSON-RPC `topics/publish` call to the extension's declared webhook. The extension backend processes it and completes the parked step through the platform.

## Decide and declare

- Ask whether the extension participates in durable flows, and whether it needs a backend to receive steps. A browser-only widget does not receive a parked step while closed.
- Declare the input topic under `versions[].surfaces.topics.subscribes` with `delivery: ["s2s"]`, a JSON Schema, and `s2sChannels.webhook.url` (HTTPS in production). Use `createS2sWebhookHandler` to verify the incoming token and JSON-RPC envelope. The same endpoint can serve ordinary s2s topics; distinguish the flow call by its `id` and the topic contract.
- Register an ES256 `s2sClient.publicJwk` and `kid` with the platform for completion. See `user-bound-s2s.md` and `scripts/generate-s2s-keypair.mjs`. This key is on the extension record, not in `manifest.json`.
- A flow program is compiled from the host's instance graph. A step may invoke an extension only; `config.hostMethod` is refused. If a step needs host data, the extension backend calls the existing user-bound s2s host method under consent.

## Complete a parked step (extension backend)

Keep the private JWK in the backend secret store. The inbound JSON-RPC `id` is `runId:stepId:call`; use that exact value for completion. Build a fresh `private_key_jwt` assertion whose audience is the full completion URL (including `/api/v1/s2s/flow/complete`). The SDK's `buildClientAssertion` limits it to 60 seconds and gives it a unique `jti`.
Install `@finamx/host-bridge` in the backend if you use its server-only `completeFlowStep` helper; it must never enter the widget bundle.

```ts
import { buildClientAssertion } from '@finamx/extension-sdk';
import { completeFlowStep } from '@finamx/host-bridge/server';

const cmsBaseUrl = process.env.FINAMX_PLATFORM_API_BASE!;
const rpcId = incoming.id; // validated JSON-RPC id from the s2s webhook
const clientAssertion = await buildClientAssertion({
  extensionId: 'com.acme.processor',
  privateJwk: JSON.parse(process.env.S2S_PRIVATE_JWK!),
  kid: process.env.S2S_KID!,
  audience: `${cmsBaseUrl.replace(/\/$/, '')}/api/v1/s2s/flow/complete`,
});
const outcome = await completeFlowStep({ cmsBaseUrl, clientAssertion, rpcId, result: {} });
if (!outcome.ok) throw new Error(`Flow completion failed: ${outcome.status} ${outcome.code ?? ''}`);
```

Send either `result` or `error`. The platform checks that the assertion's extension owns the step. Make work idempotent by `rpcId`: retries must not duplicate a side effect. Do not put user data or full step bodies into workflow IDs, logs, or the graph snapshot.

## Host side

The host BFF uses `createFlowDoorsClient` from `@finamx/host-bridge/server` with its host Bearer token. It can `startRun({ uh_, rootInstanceIds })`, `listRuns`, `getRun`, `putSchedule({ scheduleKey, cron, programHash, uh_, rootInstanceIds })`, `deleteSchedule`, and `trigger({ uh_, programHash?, rootInstanceIds? })`. Schedule cron is five fields and overlapping runs are skipped. The host can inspect a compiled program and run status through the flow doors. Never expose the host token to an iframe or the extension.

`uh_` is a pairwise user handle, not a raw host user id. The host flow doors reject `userId`, `payload`, and `sub` fields. The extension completes through `/api/v1/s2s/flow/complete`; there is no `flow.step.complete` host method or `flow.trigger` domain method.

## Verify

Test the webhook with an authenticated s2s fixture, complete with the exact incoming `id`, and check the run through the host BFF. Include a duplicate delivery and a failed completion. A local `finamx-ext dev` board proves UI and topic behavior; it does not prove Temporal execution. Use a platform environment with the Flow Runner worker for an end-to-end run.
