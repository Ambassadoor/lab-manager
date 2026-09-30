import { DarkMode, LightMode } from '@mui/icons-material';
import { Switch, useColorScheme, useMediaQuery } from '@mui/material';
import { useEffect, type JSX } from 'react';

/**
 * @requires A parent with a ThemeProvider with colorSchemes configured
 * @returns A MUI Switch component to handle toggling between dark & light modes
 */
export const DarkModeToggle = (): JSX.Element | null => {
  const { mode, setMode } = useColorScheme();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = localStorage.getItem('theme') ?? 'light';

  useEffect(() => {
    if (prefersDarkMode || theme === 'dark') {
      setMode('dark');
    } else {
      setMode('light');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersDarkMode]);

  const handleSwitch = () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    localStorage.setItem('theme', newMode);
  };

  if (!mode) return null;

  return (
    <Switch
      checked={mode === 'dark'}
      checkedIcon={<DarkMode />}
      icon={<LightMode />}
      onChange={handleSwitch}
      edge="end"
    />
  );
};
