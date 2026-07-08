import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline } from '@mui/material';
import App from './App';
import { Theme } from './context/Theme';
import { AuthProvider } from './context/AuthProvider';
import { AgGridProvider } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

//Tanstack queryclient to expire caches after 5 minutes
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
});

//Features available in AGGrid
const modules = [AllCommunityModule];

//Various providers for application, i.e. themes, auth, tanstack query, etc
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CssBaseline enableColorScheme />
        <Theme>
          <AgGridProvider modules={modules}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <App />
            </LocalizationProvider>
          </AgGridProvider>
        </Theme>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
