import { useState } from "react";

export function useAppOverlays() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [arcsOpen, setArcsOpen] = useState(false);
  const [contentBrowserOpen, setContentBrowserOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  return {
    paletteOpen,
    setPaletteOpen,
    settingsOpen,
    setSettingsOpen,
    searchOpen,
    setSearchOpen,
    arcsOpen,
    setArcsOpen,
    contentBrowserOpen,
    setContentBrowserOpen,
    appearanceOpen,
    setAppearanceOpen,
  };
}
