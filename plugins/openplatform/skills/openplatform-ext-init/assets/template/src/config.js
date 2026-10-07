// Single source of the widget identity. Must match manifest.json (scripts/finamx/check.mjs compares them).
export const EXTENSION_ID = 'com.example.hello-widget';

// Scopes the widget uses; the same list goes to versions[].capabilitiesRequested. The host grants a subset.
export const SCOPES = ['ui.toast'];

// Standalone-only answers for bridge.platform.invoke (never used inside a host). Shape them like the host's answers.
export const DEV_FIXTURES = {
  'market.quote': { symbol: 'SBER', name: 'Sberbank', price: 312.45, change: 0.8 },
};
