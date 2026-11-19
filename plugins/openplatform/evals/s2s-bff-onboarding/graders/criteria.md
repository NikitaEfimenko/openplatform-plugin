---
type: llm
weight: 1
---

- Separates developer login, inbound delivery JWT and the extension's outbound ES256 signing key.
- Uses the key generator locally and sends only the public JWK, kid, HTTPS webhook, version and target to moderation.
- Keeps private keys in environment-specific server secret stores and verifies that the active key matches the registry.
- Uses host discovery and consent-gated token minting, and calls the CMS-returned endpoint.
- Includes a test for verified inbound delivery and a successful host method or an explicit consent refusal.
