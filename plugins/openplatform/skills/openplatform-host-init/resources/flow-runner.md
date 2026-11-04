# Host Flow Runner doors

Use the platform runner when an instance graph must continue on a schedule or after the host UI closes. The host BFF needs its host Bearer token; never send it to a widget or extension backend.

```ts
import { createFlowDoorsClient } from '@finamx/host-bridge/server';

const flows = createFlowDoorsClient({ cmsBase, hostId, hostToken });
const started = await flows.startRun({ uh_, rootInstanceIds });
if (!started.ok) throw new Error(`${started.error_code}: ${started.message}`);
const run = await flows.getRun(started.runId);
```

The client also exposes `listRuns`, `putSchedule`, `deleteSchedule`, and `trigger`. Schedules use five-field cron and skip overlap. `putSchedule` needs `programHash` from the compiled run/program; `trigger` can use a program hash or roots. The doors reject `userId`, `payload`, and `sub`; pass only a pairwise `uh_` and instance IDs. Graph compilation rejects `config.hostMethod`: a step targets an extension that receives an s2s JSON-RPC call. If that extension needs host data, it calls the existing user-bound s2s method under consent.

The extension backend completes its step through `/api/v1/s2s/flow/complete` with a fresh ES256 private-key assertion and the exact inbound `runId:stepId:call` JSON-RPC id. The host does not implement `flow.step.complete` or `flow.trigger` as domain methods. Test with a deployed runner worker; local board topic simulation only verifies the live bus.
