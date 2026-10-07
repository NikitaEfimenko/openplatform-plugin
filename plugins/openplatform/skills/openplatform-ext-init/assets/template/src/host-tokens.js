// Host design tokens (UITokens from @finamx/bridge-protocol) -> CSS custom properties of the widget.
// Tokens arrive in bridge:ready (hostContext.uiTokens) and as the `host:tokens` event whenever the host changes theme;
// the SDK replays the latest tokens to a new subscriber. Without tokens (mock, old host) nothing changes and the
// palette from base.css stays.
const HOST_TOKENS_EVENT = 'host:tokens';

export function watchHostTokens(bridge, apply) {
  const initial = bridge && bridge.hostContext && bridge.hostContext.uiTokens;
  if (isTokens(initial)) apply(initial);
  try {
    bridge.platform.on(HOST_TOKENS_EVENT, e => {
      const t = e && (e.data !== undefined ? e.data : e.payload !== undefined ? e.payload : e);
      if (isTokens(t)) apply(t);
    });
  } catch (_) { /* mock without events */ }
}

// Host theme: initial hostContext.theme plus the `theme.changed` event (data: a string or { theme }).
export function watchHostTheme(bridge, applyTheme) {
  const initial = bridge && bridge.hostContext && bridge.hostContext.theme;
  if (initial === 'light' || initial === 'dark') applyTheme(initial);
  try {
    bridge.platform.on('theme.changed', e => {
      const d = e && (e.data !== undefined ? e.data : e.payload !== undefined ? e.payload : e);
      applyTheme(typeof d === 'string' ? d : d && d.theme);
    });
  } catch (_) { /* mock without events */ }
}

// Some hosts (shadcn-style) send a bare `H S% L%` triple: not a CSS color, `background: var(--bg)` would become
// invalid and transparent, so it is wrapped in hsl(). `isColor` (CSS.supports in the browser) drops anything else
// the browser does not accept as a color; that variable is then left to base.css.
const BARE_HSL = /^-?[\d.]+(deg)?[\s,]+[\d.]+%[\s,]+[\d.]+%(\s*\/\s*[\d.]+%?)?$/i;
export function normalizeColor(value, isColor) {
  if (typeof value !== 'string') return '';
  let v = value.trim();
  if (!v) return '';
  if (BARE_HSL.test(v)) v = `hsl(${v})`;
  return !isColor || isColor(v) ? v : '';
}

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Full UITokens -> CSS variables mapping (pure, no DOM). Empty values are left out.
 *   background -> --bg, card -> --surface, card-foreground -> --on-surface, muted -> --sunken, border -> --line,
 *   foreground -> --fg, muted-foreground -> --muted, primary -> --accent, primary-foreground -> --on-accent,
 *   accent -> --hover, accent-foreground -> --on-hover, destructive -> --down, fontFamily -> --font, radius -> --radius.
 * Derived: --line-strong, --faint, --accent-soft, --down-soft. --up has no token and stays from base.css.
 * Degenerate tokens are repaired (hosts that strip alpha from #RRGGBBAA turn translucent colors solid):
 *   border == foreground -> 14% of text over background; muted-foreground == foreground -> 56% of text;
 *   accent == primary (with a different accent-foreground) -> 12% of primary over the card.
 */
export function tokensToCssVars(t, { isColor } = {}) {
  const raw = (t && t.colors) || {};
  const c = {};
  for (const k of Object.keys(raw)) c[k] = normalizeColor(raw[k], isColor);
  const bg = c.background || c.card;
  const border = same(c.border, c.foreground) ? mix(c.foreground, bg, 14) : c.border;
  const mutedFg = same(c['muted-foreground'], c.foreground) ? mix(c.foreground, bg, 56) : c['muted-foreground'];
  const flatAccent = same(c.accent, c.primary) && !same(c['accent-foreground'], c['primary-foreground']);
  const hover = flatAccent ? mix(c.primary, c.card || bg, 12) : c.accent;
  const vars = {
    '--bg': c.background, '--surface': c.card, '--on-surface': c['card-foreground'], '--sunken': c.muted, '--line': border,
    '--line-strong': mix(border, c.foreground, 75), '--fg': c.foreground, '--muted': mutedFg,
    '--faint': mix(mutedFg, c.background, 60), '--accent': c.primary,
    '--accent-soft': soft(c.primary, 12), '--on-accent': c['primary-foreground'],
    '--hover': hover, '--on-hover': c['accent-foreground'],
    '--down': c.destructive, '--down-soft': soft(c.destructive, 8),
    '--font': t && t.fontFamily, '--radius': normalizeRadius(t && t.radius),
  };
  for (const k of Object.keys(vars)) if (!vars[k]) delete vars[k];
  return vars;
}

// '0.5rem' / '8px' as is; a bare number means pixels ('0' too, otherwise calc() in base.css breaks).
export function normalizeRadius(r) {
  if (typeof r === 'number' && Number.isFinite(r) && r >= 0) return r + 'px';
  if (typeof r !== 'string') return '';
  const v = r.trim();
  if (/^\d*\.?\d+$/.test(v)) return v + 'px';
  return /^\d*\.?\d+(px|rem|em)$/.test(v) ? v : '';
}

// Sets variables on :root through CSSOM (allowed by the platform CSP, unlike a style="" attribute).
export function setRootVars(vars) {
  const s = document.documentElement.style;
  for (const [name, value] of Object.entries(vars)) if (value) s.setProperty(name, value);
}

// 'light' | 'dark' from the lightness of the host background, or null when the color cannot be parsed.
// lightnessOf is the fallback for formats parsed only by the browser (oklch, color-mix, named colors).
export function themeFromTokens(t, { lightnessOf } = {}) {
  const color = normalizeColor(t && t.colors && t.colors.background);
  let l = lightness(color);
  if (l == null && color && lightnessOf) l = lightnessOf(color);
  return l == null ? null : l > 0.5 ? 'light' : 'dark';
}

export function soft(color, percent) {
  return color ? `color-mix(in srgb, ${color} ${percent}%, transparent)` : '';
}

export function mix(a, b, percentA) {
  return a && b ? `color-mix(in srgb, ${a} ${percentA}%, ${b})` : '';
}

function isTokens(t) {
  return !!(t && typeof t === 'object' && t.colors && typeof t.colors === 'object');
}

function lightness(color) {
  if (typeof color !== 'string') return null;
  const c = color.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(x => x + x).join('');
    if (h.length < 6) return null;
    return luminance(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return luminance(+m[1], +m[2], +m[3]);
  m = /^hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+([\d.]+)%/i.exec(c);
  if (m) return +m[1] / 100;
  return null;
}

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Dev switch ?devtokens=ocean|paper: only standalone on localhost, ignored inside a host.
const mk = (bg, fg, card, cardFg, muted, mutedFg, border, primary, primaryFg, accent, accentFg, destructive, radius, fontFamily) => ({
  colors: { background: bg, foreground: fg, primary, 'primary-foreground': primaryFg, muted, 'muted-foreground': mutedFg, border, accent, 'accent-foreground': accentFg, card, 'card-foreground': cardFg, destructive },
  radius, fontFamily,
});
export const DEV_TOKEN_SETS = {
  ocean: mk('#0b1f33', '#e6f1ff', '#12304d', '#d0e4ff', '#1b3b5c', '#8fb0d4', '#2a4d73', '#00b3a4', '#031a18', '#1f4a73', '#ffffff', '#ff6b6b', '0.25rem', 'Georgia, serif'),
  paper: mk('#fbf7ef', '#2b2118', '#fffdf8', '#3a2c20', '#efe6d6', '#7a6a58', '#dccfba', '#c2410c', '#fff7ed', '#f3e3c8', '#3a2c20', '#b91c1c', '1rem', 'Verdana, sans-serif'),
};
export function resolveDevTokens(mode, loc = globalThis.location) {
  if (mode !== 'standalone' || !loc || (loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1')) return null;
  const name = new URLSearchParams(loc.search).get('devtokens');
  return name && Object.prototype.hasOwnProperty.call(DEV_TOKEN_SETS, name) ? name : null;
}
