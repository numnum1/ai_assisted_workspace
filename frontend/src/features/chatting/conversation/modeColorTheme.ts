export function effectiveModeColor(
  modeColor: string,
  theme: "light" | "dark",
): string | undefined {
  void theme;
  return modeColor;
}

export function getContrastingTextColor(_backgroundColor: string): string {
  return "#000000";
}
