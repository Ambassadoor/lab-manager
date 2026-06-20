import { createTheme, ThemeProvider } from '@mui/material';
import { type PropsWithChildren } from 'react';

const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#260859',
        },
        secondary: {
          main: '#ab8e44',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#9d99c6',
          contrastText: '#ffffff'
        },
        secondary: {
          main: '#ab8e44',
        },
      },
    },
  },
});

export const Theme = ({ children }: PropsWithChildren) => {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
