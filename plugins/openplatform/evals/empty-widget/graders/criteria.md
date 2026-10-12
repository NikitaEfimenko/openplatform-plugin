---
type: llm
weight: 1
---

A good answer:
- identifies embedSandbox without allow-same-origin as the cause: the iframe gets an opaque origin and the module script (artifact served without CORS) is blocked, so the JS never runs;
- tells to remove embedSandbox (platform default is allow-scripts allow-same-origin allow-popups allow-forms on an isolated origin);
- mentions other CSP causes to rule out (inline scripts/styles, eval/new Function, WebAssembly) briefly;
- recommends verifying inside a real host bridge with the platform CSP (`finamx-ext check --host <hostId>`, and the `finamx-ext dev` board under the platform CSP) because the mock bridge proves nothing about CSP/sandbox;
- notes the fix needs a new version (bump semver) and resubmission.
Fail if it recommends copying platform scripts into the project, or it does not identify the sandbox (missing allow-same-origin) as the cause, or recommends keeping the strict embedSandbox.
