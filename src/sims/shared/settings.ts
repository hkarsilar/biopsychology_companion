/**
 * Site-wide settings shared by the page and every simulation:
 * theme, text size, reduced motion and sound. Stored in localStorage and mirrored as
 * data attributes on <html>, so CSS can react without JavaScript.
 */

export interface SiteSettings {
  theme: 'dark' | 'light';
  text: 'normal' | 'large' | 'larger';
  /** 'system' follows the operating system's "reduce motion" setting */
  motion: 'system' | 'reduce' | 'full';
  sound: boolean;
}

const KEY = 'nc-settings';
const EVENT = 'nc:settings';

const defaults: SiteSettings = { theme: 'dark', text: 'normal', motion: 'system', sound: false };

function read(): SiteSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function getSettings(): SiteSettings {
  return read();
}

export function applySettings(s: SiteSettings): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  if (s.text === 'normal') delete root.dataset.text;
  else root.dataset.text = s.text;
  if (s.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = s.motion;
  root.dataset.sound = s.sound ? 'on' : 'off';
}

export function setSetting<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]): void {
  const s = { ...read(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings last for this page only */
  }
  applySettings(s);
  document.dispatchEvent(new CustomEvent(EVENT, { detail: s }));
}

export function onSettingsChange(cb: (s: SiteSettings) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<SiteSettings>).detail);
  document.addEventListener(EVENT, handler);
  return () => document.removeEventListener(EVENT, handler);
}

/** True when animation should be replaced by still frames. */
export function prefersReducedMotion(): boolean {
  const motion = document.documentElement.dataset.motion;
  if (motion === 'reduce') return true;
  if (motion === 'full') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function soundOn(): boolean {
  return document.documentElement.dataset.sound === 'on';
}
