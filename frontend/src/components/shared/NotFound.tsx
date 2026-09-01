import { Box, Button, Stack, Typography } from '@mui/material';
import { Home, Refresh, SearchOff } from '@mui/icons-material';
import { Link } from 'react-router-dom';

type StatusPageProps = {
  icon: React.ReactNode;
  title: string;
  message: string;
  // Only real unexpected errors get a retry action — a 404 isn't going to
  // resolve itself on reload, so NotFound never passes this.
  onRetry?: () => void;
};

// Shared layout for the 404 page and App.tsx's generic route-error page —
// same "what happened / where can I go" shape either way.
export function StatusPage({ icon, title, message, onRetry }: StatusPageProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        minHeight: '60dvh',
        p: 3,
        textAlign: 'center',
      }}
    >
      {icon}
      <Typography variant="h4">{title}</Typography>
      <Typography color="text.secondary">{message}</Typography>
      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
        <Button variant="contained" component={Link} to="/" startIcon={<Home />}>
          Go Home
        </Button>
        {onRetry && (
          <Button variant="outlined" onClick={onRetry} startIcon={<Refresh />}>
            Try Again
          </Button>
        )}
      </Stack>
    </Box>
  );
}

// Used both for App.tsx's catch-all route/thrown-404 ErrorBoundary case,
// and directly by detail pages (ContainerDetail, ChemicalDetail) whose
// useQuery has no matching row — TanStack Query errors don't propagate to
// the router's ErrorBoundary on their own (no throwOnError configured), so
// "the id in the URL doesn't exist" has to be handled at the query-result
// level, same as any other isError case in this app.
export function NotFound() {
  return (
    <StatusPage
      icon={<SearchOff color="disabled" sx={{ fontSize: 64 }} />}
      title="404 — Not Found"
      message="The page you're looking for doesn't exist or may have been moved."
    />
  );
}
