import { defaultUITokens, mergeUITokens, type UITokens } from '@finamx/bridge-protocol';

/** Map host CSS variables → bridge UITokens (partial merge over defaults). */
export function readHostUITokens(): UITokens {
  if (typeof window === 'undefined') return mergeUITokens({});
  const style = getComputedStyle(document.documentElement);
  const colors = { ...defaultUITokens.colors };
  for (const key of Object.keys(colors) as (keyof UITokens['colors'])[]) {
    const v = style.getPropertyValue(`--${key}`).trim();
    if (v) colors[key] = v;
  }
  const radius = style.getPropertyValue('--radius').trim();
  const fontFamily = style.getPropertyValue('--font-family').trim();
  return mergeUITokens({
    colors,
    ...(radius ? { radius } : {}),
    ...(fontFamily ? { fontFamily } : {}),
  });
}
