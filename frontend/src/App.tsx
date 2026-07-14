import {
  Outlet,
  createBrowserRouter,
  RouterProvider,
  type RouteObject,
  useRouteError,
  isRouteErrorResponse,
  Navigate,
} from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { Navbar } from './components/nav/Navbar';
import { useAuth } from './context/AuthContext';
import { Login } from './components/accounts/Login';
import { Register } from './components/accounts/Register';
import { Containers } from './components/inventory/Containers';
import { ContainerForm } from './components/inventory/ContainerForm';
import { ContainerDetail } from './components/inventory/ContainerDetail';
import { ContainerActions } from './components/inventory/ContainerActions';
import { Locations } from './components/inventory/locations/Locations';
import { Chemicals } from './components/inventory/chemicals/Chemicals';
import { ChemicalDetail } from './components/inventory/chemicals/ChemicalDetail';
import { Dashboard } from './components/inventory/Dashboard';

// Component to show when an error is thrown
//TODO: Create an Error component to show when error is not 404
function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <Box>
        <Typography variant="h1">
          {error.status} {error.statusText}
        </Typography>
        <Typography>{error.data?.message || 'Something went wrong.'}</Typography>
      </Box>
    );
  }
  return <NotFound />;
}

//404 page
//TODO: Expand this with error messages, navigation, and retry messages
function NotFound() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">404 — Not Found</Typography>
    </Box>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  const { user, loading } = useAuth();

  const routes: RouteObject[] = [
    {
      path: '/',
      element: <Navbar />,
      children: [
        {
          errorElement: <ErrorBoundary />,
          children: [
            { index: true, element: user ? <Dashboard /> : <Login /> },
            { path: 'login', element: <Login /> },
            { path: 'register', element: <Register /> },
            // Auth protected routes
            ...[
              {
                path: 'inventory',
                element: <RequireAuth />,
                children: [
                  {
                    path: 'containers',
                    element: <Outlet />,
                    children: [
                      { index: true, element: <Containers /> },
                      { path: 'new', element: <ContainerForm /> },
                      { path: ':id', element: <ContainerDetail /> },
                      { path: 'actions', element: <ContainerActions /> },
                    ],
                  },
                  {
                    path: 'locations',
                    element: <Outlet />,
                    children: [{ index: true, element: <Locations /> }],
                  },
                  {
                    path: 'chemicals',
                    element: <Outlet />,
                    children: [
                      { index: true, element: <Chemicals /> },
                      { path: ':chemId', element: <ChemicalDetail /> },
                    ],
                  },
                ],
              },
            ],
            // Catches unsupported routes
            { path: '*', element: <NotFound /> },
          ],
        },
      ],
    },
  ];

  const router = createBrowserRouter(routes);

  // Only load page after auth has resolved
  if (loading) return null;

  return <RouterProvider router={router} />;
}
