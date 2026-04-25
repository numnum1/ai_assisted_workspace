import { describe, expect, it } from 'vitest';
import {
  effectiveModeColor,
  getContrastingTextColor,
  invertHslLightnessFromHex,
} from './modeColorTheme.ts';

describe('invertHslLightnessFromHex', () => {
  it('maps black to white and white to black', () => {
    expect(invertHslLightnessFromHex('#000000')).toBe('#ffffff');
    expect(invertHslLightnessFromHex('#ffffff')).toBe('#000000');
  });

  it('returns null for invalid input', () => {
    expect(invertHslLightnessFromHex('not-a-color')).toBeNull();
    expect(invertHslLightnessFromHex('#abc')).toBeNull();
  });

  it('inverts a mid blue predictably (HSL L flip)', () => {
    const a = invertHslLightnessFromHex('#89b4fa');
    const b = invertHslLightnessFromHex(a!);
    expect(b?.toLowerCase()).toBe('#89b4fa');
  });
});

describe('effectiveModeColor', () => {
  it('passes through in dark mode', () => {
    expect(effectiveModeColor('#89b4fa', 'dark')).toBe('#89b4fa');
  });

  it('inverts in light mode', () => {
    const inv = effectiveModeColor('#1e1e2e', 'light');
    expect(inv).toBe(invertHslLightnessFromHex('#1e1e2e'));
  });

  it('returns undefined when hex is undefined', () => {
    expect(effectiveModeColor(undefined, 'light')).toBeUndefined();
  });
});

describe('getContrastingTextColor', () => {
  it('returns dark text on light background', () => {
    expect(getContrastingTextColor('#ffffff')).toBe('#1e1e2e');
  });

  it('returns light text on dark background', () => {
    expect(getContrastingTextColor('#1e1e2e')).toBe('#f5f5ff');
  });

  it('returns undefined for bad hex', () => {
    expect(getContrastingTextColor('nope')).toBeUndefined();
  });
});
