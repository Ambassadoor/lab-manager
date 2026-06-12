import { Routes, Route } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { Navbar } from './components/nav/Navbar';
import { useAuth } from './context/AuthContext';


function NotFound() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">404 — Not Found</Typography>
    </Box>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return null
  
  return (
      <Routes>
        <Route path="/" element={<Navbar />}>
          <Route index element={
            user
            ? <>Dashboard</>
            : <>Login</>
          }/>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
  );
}
