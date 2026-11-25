# Build and verify a Flow V2 program

First explain what a Flow program does and settle the developer’s choice with [guided discovery](flow-discovery.md).
Reuse an existing PRD decision.

## Choose the route

| User needs | Start here |
|---|---|
| React to a neighbour while the board is open | Configure Bridge topics on the board. |
| Receive a server event or read consent-gated host data from a BFF | Follow [user-bound S2S](user-bound-s2s.md). Add a program only if the user needs durable steps. |
| Run steps manually, on a trigger, or on a schedule while the board can be closed | Follow the Flow V2 path below. |

At each handoff give the user the next action, who owns it and what evidence marks it complete. For an existing program start at the first missing piece of evidence.

## 1. Find the real host contract

Run the commands below when the authorized developer session and terminal are available. Use the portal selected
for the project. Start with `hosts` and use a returned host ID. If several hosts fit and the user has not chosen one,
show the candidates and ask which to target. If several Publishers are available, select the extension's Publisher
for Publisher-scoped commands.

When you cannot run the CLI, include this command block in your first answer, even when the user also asks for
debugging or a short code example. Use the known host ID, or leave `<hostId>` and explain where to find it.
If the CLI reports missing login, ask the developer to run `finamx-ext login` in their terminal. Resume discovery
when access is available. If the CLI is unavailable but the developer cabinet is accessible, ask for the host's
copied context.

```bash
finamx-ext hosts --json
finamx-ext domain pull <hostId> --json
finamx-ext context <hostId>
```

Read the resulting domain and context. Show the selected host, actual method names, required scopes and request/response schemas. If the host is missing or a required method is absent, identify the host owner or access change needed before designing against that method. General templates can support planning without proving host support.

## 2. Start with one extension step

Ask which host owns execution, what triggers it, where the data comes from and who owns effects. Agree on one source step with a concrete S2S request topic and a schema-backed output named by its `replyTopicType`. Use the [holdings manifest](../examples/holdings-manifest.json) as a pattern. The host compiles the selected instance and pins the extension version, source revision, state and contracts.

For AlphaBuilder, begin with **model holdings → holdings artifact**. Add the paper portfolio snapshot, Mapper, paper Execution and Delivery after the source step completes. Save explicit edges between concrete compatible ports. A saved Bridge connection proves live wiring. Verify the program separately in the host's program builder or through the host BFF.

## 3. Register and connect the BFF

Deploy the HTTPS webhook, generate an environment-specific ES256 key pair using the [key setup](user-bound-s2s.md), and place the private JWK in the BFF secret store. Submit the extension version with its webhook URL. Register the public JWK with `finamx-ext s2s register --public-jwk .secrets/finamx-s2s/s2s-public.jwk.json` after the record exists. See key setup for CLI/CMS availability and moderator-managed rotation. Confirm the approved version and host access, validate consent for the declared methods, and check that the active BFF key matches the registration.

The webhook verifies delivery and invocation, stores one durable job per invocation, then acknowledges receipt. The worker reads authorized context, validates and writes the artifact, and calls [`completeStep`](../examples/complete-holdings.ts) with the artifact reference. Use the [Flow V2 contract](flow-runner.md) for trust, retries and cancellation.

## 4. Verify one manual run, then schedule

| Last evidence | Next check |
|---|---|
| Compile rejected | Inspect the selected instance and version, concrete request/reply schemas and host access. |
| HTTP 2xx; run still waiting | Correlate the invocation ID with the BFF's JSON-RPC response and durable job record. |
| Job saved; artifact absent | Check consent and scoped context/artifact calls, then the worker outcome. |
| Artifact saved; run still waiting | Check callback audience, key registration and the owner's Flow V2 ACK for the same invocation. |
| Owner ACK received | Confirm the artifact and completed step in run history. Replay the same delivery and verify one result. |

Use test data and paper execution for the end-to-end check. Confirm cancellation fences late results before adding a schedule. Run once with the board closed and inspect terminal status and downstream output. A CLI dry run or local board verifies only its own boundary.
