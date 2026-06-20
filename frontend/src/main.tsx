import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline } from '@mui/material';
import App from './App';
import { Theme } from './context/Theme';
import { AuthProvider } from './context/AuthProvider';
import { AgGridProvider } from 'ag-grid-react';
import { AllCommunityModule } from 'ag-grid-community';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60 * 5 },
  },
});

const modules = [AllCommunityModule];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CssBaseline enableColorScheme />
          <Theme>
            <AgGridProvider modules={modules}>
              <App />
            </AgGridProvider>
          </Theme>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
