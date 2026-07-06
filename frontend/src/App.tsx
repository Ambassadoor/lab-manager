import {
  Route,
  Outlet,
  createBrowserRouter,
  RouterProvider,
  createRoutesFromElements,
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

function ErrorBoundary() {
  return <NotFound />;
}

function NotFound() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">404 — Not Found</Typography>
    </Box>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route path="/" element={<Navbar />}>
        <Route errorElement={<ErrorBoundary />}>
          <Route index element={user ? <>Dashboard</> : <Login />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="inventory" element={<Outlet />}>
            <Route path="containers" element={<Outlet />}>
              <Route path="" element={<Containers />} />
              <Route path="new" element={<ContainerForm />} />
              <Route path=":id" element={<ContainerDetail />} />
              <Route path="actions" element={<ContainerActions />} />
            </Route>
            <Route path="locations" element={<Outlet />}>
              <Route path="" element={<Locations />} />
            </Route>
            <Route path="chemicals" element={<Outlet />}>
              <Route path="" element={<Chemicals />} />
              <Route path=":chemId" element={<ChemicalDetail />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    )
  );

  if (loading) return null;

  return <RouterProvider router={router} />;
}
