/**
 * Per-chat mode colors are stored as dark-UI reference (#RRGGBB).
 * In light theme, display uses HSL lightness inversion (L' = 1 - L) only.
 */

const HEX6 = /^#([0-9A-Fa-f]{6})$/;

function parseHex6(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().match(HEX6);
  if (!m) return null;
  const n = m[1]!;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    case b:
      h = (r - g) / d + 4;
      break;
    default:
      h = 0;
  }
  h /= 6;
  return { h: h * 360, s, l };
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, n));
}

function toHex6(r: number, g: number, b: number): string {
  const c = (x: number) => clampChannel(x).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** HSL L → 1 − L, same hue/saturation. */
export function invertHslLightnessFromHex(hex: string): string | null {
  const rgb = parseHex6(hex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const l2 = 1 - l;
  const { r, g, b } = hslToRgb(h, s, l2);
  return toHex6(r, g, b);
}

/**
 * `hex` is the stored dark-UI mode color. For light theme, returns HSL-inverted
 * color for display; dark theme returns `hex` unchanged. Invalid/undefined → undefined.
 */
export function effectiveModeColor(
  hex: string | undefined,
  theme: 'light' | 'dark',
): string | undefined {
  if (theme === 'dark' || !hex) return hex;
  const out = invertHslLightnessFromHex(hex);
  return out ?? hex;
}

/**
 * Text color for overlays on a solid `hex` background (bubbles, mode select).
 */
export function getContrastingTextColor(hexColor?: string): string | undefined {
  if (!hexColor || !HEX6.test(hexColor)) return undefined;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e1e2e' : '#f5f5ff';
}
