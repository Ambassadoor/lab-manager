import {
  Outlet,
  createBrowserRouter,
  RouterProvider,
  type RouteObject,
  useRouteError,
  isRouteErrorResponse,
  Navigate,
} from 'react-router-dom';
import './App.css';
import { Error as ErrorIcon } from '@mui/icons-material';
import { Navbar } from './components/nav/Navbar';
import { useAuth } from './context/AuthContext';
import { Login } from './components/accounts/Login';
import { Register } from './components/accounts/Register';
import { Profile } from './components/accounts/Profile';
import { Users } from './components/accounts/Users';
import { UserDetail } from './components/accounts/UserDetail';
import { hasRoleAtLeast } from './components/shared/roles';
import type { Role } from './types';
import { Containers } from './components/inventory/Containers';
import { ContainerForm } from './components/inventory/ContainerForm';
import { ContainerDetail } from './components/inventory/ContainerDetail';
import { ContainerActions } from './components/inventory/ContainerActions';
import { Locations } from './components/inventory/locations/Locations';
import { Chemicals } from './components/inventory/chemicals/Chemicals';
import { ChemicalDetail } from './components/inventory/chemicals/ChemicalDetail';
import { Dashboard } from './components/inventory/Dashboard';
import { NotFound, StatusPage } from './components/shared/NotFound';

// Component to show when an error is thrown. In practice this only ever
// sees plain unexpected exceptions today — this app has no React Router
// loaders/actions, and apiFetch's errors are caught locally by each query
// (see client.ts / ContainerDetail.tsx / ChemicalDetail.tsx for the 404
// case specifically), so they never reach here. The isRouteErrorResponse
// branch is kept for if a loader/action is ever added later — that's the
// only way a real route error response reaches this boundary.
function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <StatusPage
        icon={<ErrorIcon color="error" sx={{ fontSize: 64 }} />}
        title={`${error.status} ${error.statusText}`}
        message={error.data?.message || 'Something went wrong.'}
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Not a route error response at all — an actual unexpected exception
  // during render. This is the one case a plain reload can plausibly fix
  // (a stale chunk after a deploy, a transient render bug); showing the 404
  // page here would say "page doesn't exist" about a real crash.
  return (
    <StatusPage
      icon={<ErrorIcon color="error" sx={{ fontSize: 64 }} />}
      title="Something went wrong"
      message={error instanceof Error ? error.message : 'An unexpected error occurred.'}
      onRetry={() => window.location.reload()}
    />
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Same shape as RequireAuth, plus a role floor — used for pages the backend
// itself restricts by role (see role_at_least in apps/users/permissions.py),
// so someone who can't use the page never lands on it in the first place
// rather than seeing it 403 after the fact.
export function RequireRole({ role }: { role: Role }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || !hasRoleAtLeast(user, role)) return <Navigate to="/" replace />;
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
                path: 'profile',
                element: <RequireAuth />,
                children: [{ index: true, element: <Profile /> }],
              },
              {
                path: 'users',
                element: <RequireRole role="lab_manager" />,
                children: [
                  { index: true, element: <Users /> },
                  { path: ':id', element: <UserDetail /> },
                ],
              },
              {
                path: 'inventory',
                element: <RequireAuth />,
                children: [
                  {
                    path: 'containers',
                    element: <Outlet />,
                    children: [
                      { index: true, element: <Containers /> },
                      {
                        path: 'new',
                        element: <RequireRole role="stockroom" />,
                        children: [{ index: true, element: <ContainerForm /> }],
                      },
                      { path: ':id', element: <ContainerDetail /> },
                      {
                        path: 'actions',
                        element: <RequireRole role="stockroom" />,
                        children: [{ index: true, element: <ContainerActions /> }],
                      },
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
