import { Routes, Route } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from './context/AuthContext';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Typography sx={{ p: 3 }}>Loading...</Typography>;
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">Lab Manager</Typography>
      <Typography>{user ? `Signed in as ${user.username}` : 'Not signed in'}</Typography>
    </Box>
  );
}

function NotFound() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4">404 — Not Found</Typography>
    </Box>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
