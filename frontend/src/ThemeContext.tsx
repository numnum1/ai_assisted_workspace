import { createContext } from "react";

export type ThemeName = "light" | "dark";

export type ThemeContextType = {
  name: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

export const ThemeContext = createContext<ThemeContextType>({
  name: "light",
  setTheme: () => {},
});
