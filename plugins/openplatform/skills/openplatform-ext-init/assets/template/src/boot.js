// Widget start: real host bridge inside a host, mock bridge standalone; host theme and tokens; failure states.
// Inside a host the widget never falls back to the mock: that would show a foreign theme and fake data.
import { createExtensionBridge, ensureEmbedSession, hasEmbedSession } from '@finamx/extension-sdk';
import { createMockBridge, createFixtureInvoke } from '@finamx/extension-sdk/mock';
import { watchHostTokens, watchHostTheme, setRootVars, themeFromTokens, tokensToCssVars, resolveDevTokens, DEV_TOKEN_SETS } from './host-tokens.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const prefersDark = () => { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return true; } };

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
}

// Browser fallbacks: host tokens may use any CSS color syntax (hsl, oklch, color-mix).
const isCssColor = v => { try { return CSS.supports('color', v); } catch (_) { return true; } };
function cssLightness(color) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = color;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
    return a === 0 ? null : (0.2126 * r + 0.7152 * gr + 0.0722 * b) / 255;
  } catch (_) { return null; }
}

function applyHostTokens(t) {
  const theme = themeFromTokens(t, { lightnessOf: cssLightness });
  if (theme) applyTheme(theme);
  setRootVars(tokensToCssVars(t, { isColor: isCssColor }));
}

// Boot stage on <html data-boot>: missing or 'wait' -> content hidden, transparent background (no black flash);
// 'host' / 'standalone' -> running; 'error' -> the host did not answer the handshake.
const setBoot = stage => { document.documentElement.dataset.boot = stage; };

// How long to wait for the host before showing a notice. The SDK keeps saying hello for ~30 s; if the host
// answers later the widget still starts and the notice goes away.
const HANDSHAKE_NOTICE_MS = 8_000;

function showHostFailure(reason) {
  console.error('[widget] host bridge handshake failed: ' + reason);
  applyTheme(prefersDark() ? 'dark' : 'light');
  setBoot('error');
  const el = $('#state');
  if (!el) return;
  el.hidden = false;
  el.className = 'state unavail';
  el.innerHTML = '<b>No connection to the host</b>The widget runs inside a host, but the host did not answer the bridge handshake ('
    + esc(reason) + '). Reload the page; if that does not help, contact the host owner.';
}

export function showFailure(err) {
  const el = $('#state');
  if (!el) return;
  // bridge.platform.invoke rejects with a plain Error: the host's code is only in the message.
  const text = String((err && (err.code || err.message)) || err);
  el.hidden = false;
  if (/SCOPE_DENIED|CAPABILITY_DENIED|NOT_GRANTED|denied/i.test(text)) {
    el.className = 'state denied';
    el.innerHTML = '<b>No access</b>The host did not grant the permission this view needs, or does not offer this method.';
  } else {
    el.className = 'state unavail';
    el.innerHTML = '<b>Error</b>' + esc((err && err.message) || String(err));
  }
}

export function clearFailure() {
  const el = $('#state');
  if (el) { el.hidden = true; el.textContent = ''; }
}

/**
 * bootWidget({ extensionId, scopes, fixtures, start }): start({ bridge, mode, toast, showFailure }).
 * `fixtures` answer bridge.platform.invoke in standalone mode only (createFixtureInvoke marks them `_mock`).
 * An exception thrown by start() is shown as a failure state, not as an empty screen.
 */
export async function bootWidget({ extensionId, scopes = [], fixtures = {}, start }) {
  ensureEmbedSession();
  let bridge = null;
  let mode = 'standalone';
  if (hasEmbedSession()) {
    setBoot('wait');
    const notice = setTimeout(() => showHostFailure('no answer within ' + HANDSHAKE_NOTICE_MS / 1000 + ' s, still waiting'), HANDSHAKE_NOTICE_MS);
    try {
      bridge = await createExtensionBridge({ extensionId });
      mode = 'host';
    } catch (err) {
      clearTimeout(notice);
      showHostFailure((err && err.message) || String(err));
      return;
    }
    clearTimeout(notice);
    clearFailure();
  } else {
    const devTokens = resolveDevTokens(mode);
    bridge = createMockBridge({
      grantedScopes: scopes,
      hostContext: { theme: prefersDark() ? 'dark' : 'light', locale: navigator.language || 'en', ...(devTokens ? { uiTokens: DEV_TOKEN_SETS[devTokens] } : {}) },
      invokeHandler: createFixtureInvoke(fixtures),
    });
  }
  watchHostTheme(bridge, applyTheme);
  watchHostTokens(bridge, applyHostTokens);
  setBoot(mode);
  if (mode === 'host') { try { bridge.ui.autoResize(); } catch (_) { /* older host without autoResize */ } }
  const toast = (msg, variant) => {
    try { if (bridge.grantedScopes.includes('ui.toast')) bridge.ui.toast(msg, variant || 'info'); } catch (_) { /* no toast */ }
  };
  try {
    await start({ bridge, mode, toast, showFailure });
  } catch (err) {
    console.warn('[widget] start failed', err);
    showFailure(err);
  }
}
