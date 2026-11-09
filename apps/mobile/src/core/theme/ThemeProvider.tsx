import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palette, type Colors } from './tokens';

const ThemeContext = createContext<Colors>(palette.light);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  return <ThemeContext.Provider value={scheme === 'dark' ? palette.dark : palette.light}>{children}</ThemeContext.Provider>;
}

export const useColors = () => useContext(ThemeContext);
