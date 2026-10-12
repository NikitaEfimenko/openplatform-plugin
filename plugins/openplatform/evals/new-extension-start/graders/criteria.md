---
type: llm
weight: 1
---

A good answer:
- asks a few clarifying questions or presents a plan with clearly recommended defaults instead of a long survey (e.g. widget, scaffold with `npx @finamx/extension-sdk init`, artifact upload, no backend unless the news API needs a secret);
- learns the host's topics and methods from the CLI (`finamx-ext hosts`, `finamx-ext domain pull <hostId>`) instead of asking the host owner;
- proposes subscribing to the fdc3.instrument topic to get the selected instrument and declaring it in manifest.json surfaces.topics.subscribes;
- explains where news come from: a news API with CORS declared in csp.connect, or a backend if it needs a key;
- mentions the manifest format versions[].surfaces with an extensionId like com.<you>.<slug>, @finamx/extension-sdk, applying host theme/UI tokens, and verifying before publishing with `finamx-ext check --host <hostId>` and the `finamx-ext dev` board;
- does not tell the user to set embedSandbox.
Fail if it tells to copy a bundled template or scripts, or it invents a manifest with kind/widget fields or tells to host the widget on their own server as the required path.
