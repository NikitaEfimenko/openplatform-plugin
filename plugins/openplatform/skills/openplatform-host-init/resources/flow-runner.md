# Host Flow V2 lifecycle

The host BFF owns run authorization, consent, and any user data or effects that the extension requests. Keep the host Bearer server-side. Persist the full immutable run binding before starting, and reuse it when recovering an uncertain start.

```ts
import { createFlowV2DoorsClient } from '@finamx/host-bridge/server';

const flows = createFlowV2DoorsClient({ cmsBase, hostId, hostToken });
const program = await flows.createProgram(selection);
if (!program.ok) throw new Error(program.error_code);
const binding = await reserveRun(program.programHash);
const started = await flows.startRun(binding);
const observation = await flows.observeRun(binding);
```

`selection` captures selected instances, concrete executor topics, extension versions, state hashes, source revision, identity extension and pairwise `uh_`. `reserveRun` represents the host's durable reservation of run ID, program hash, identity, activation ID, generation and execution context reference. Check the start result for refusal or uncertainty and reconcile with `observeRun` using that reservation. Cancel with `cancelBoundRun(binding)` and observe the terminal status. Use the target host's scheduler with an explicit overlap policy. Run starts use opaque execution context references.

For a dedicated data method, declare the request and response schemas and scope in the host domain and enforce them on both sides of its handler. Authorize artifacts by principal, pending invocation, port and pinned schema. Keep a durable ledger for any external effect, and fence completion against cancellation and a superseding generation. Use the deployed owner and runner to verify this lifecycle. A local board exercises interactive Bridge wiring.
