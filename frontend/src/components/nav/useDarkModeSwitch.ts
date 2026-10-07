import { useColorScheme } from '@mui/material';

// The current mode and a function to flip it, remembering the choice. For a
// second control (the phone nav drawer's) beside DarkModeToggle.
export function useDarkModeSwitch() {
  const { mode, setMode } = useColorScheme();
  const toggle = () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    localStorage.setItem('theme', newMode);
  };
  return { mode, toggle };
}
