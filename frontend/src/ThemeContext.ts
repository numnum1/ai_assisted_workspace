import { createContext, type Dispatch, type SetStateAction } from "react";

export type ThemeName = "light" | "dark";

export type ThemeContextType = {
  name: ThemeName;
  setName: Dispatch<SetStateAction<ThemeName>>;
};

export const ThemeContext = createContext<ThemeContextType>({
  name: "light",
  setName: () => {},
});
