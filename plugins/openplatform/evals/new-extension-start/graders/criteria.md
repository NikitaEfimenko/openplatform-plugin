---
type: llm
weight: 1
---

A good answer:
- asks a few clarifying questions or presents a plan with clearly recommended defaults instead of a long survey (e.g. widget, start from a template, artifact upload, no backend unless the news API needs a secret);
- proposes subscribing to the fdc3.instrument topic to get the selected instrument and declaring it in manifest.json surfaces.topics.subscribes;
- explains where news come from: a news API with CORS declared in csp.connect, or a backend if it needs a key;
- mentions the manifest format versions[].surfaces with an extensionId like com.<you>.<slug>, @finamx/extension-sdk, applying host theme/UI tokens, and verifying in a real host before publishing;
- does not tell the user to set embedSandbox.
Fail if it invents a manifest with kind/widget fields or tells to host the widget on their own server as the required path.
