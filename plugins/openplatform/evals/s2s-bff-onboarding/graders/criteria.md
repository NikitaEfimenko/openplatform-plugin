---
type: llm
weight: 1
---

- Separates developer login, inbound delivery JWT and the extension's outbound ES256 signing key.
- Uses `finamx-ext s2s keygen --out-dir` locally and `finamx-ext s2s register --public-jwk` with developer login and an explicit Publisher when needed. Checks CLI/CMS availability and explains the upgrade dependency if absent.
- Ignores the secret directory before generation; never asks for a private JWK or developer token in chat. Registers after the extension record exists and sends only the public JWK and kid to the key endpoint; webhook URL stays in the version manifest.
- Explains that exact registration retries are safe, that published-key replacement or kid changes need a moderator, and that registration is not proof of publication, consent or end-to-end readiness.
- Keeps private keys in environment-specific server secret stores and verifies that the active key matches the registry.
- Uses host discovery and consent-gated token minting, and calls the CMS-returned endpoint.
- Includes a test for verified inbound delivery and a successful host method or an explicit consent refusal.
