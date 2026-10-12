---
type: llm
weight: 1
---

A good answer:
- explains that the extension exists but is owned by another publisher account: the versions endpoint only finds extensions submitted by the token owner, and answers 404 instead of 403 to avoid disclosing ownership;
- gives options: use the owner's token, ask a moderator to transfer ownership (or delete and resubmit, noting that host availability/installs are lost), or choose a new extensionId;
- notes that `finamx-ext publish` already switches to a new version on a 409 conflict, and that `finamx-ext status` can be used to check the state of the extension and its versions;
- does not blame the token itself.
Fail if it says the token is invalid or the endpoint is wrong.
