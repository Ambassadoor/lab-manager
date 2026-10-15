import { EditNote } from '@mui/icons-material';
import { Box, Button, Container, Link, Skeleton, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSdsById } from '../../api/sds';
import { sdsKeys } from '../../api/queryKeys';
import { SafetyHeader } from './SafetyHeader';
import { NotFound } from '../shared/NotFound';
import { ghsPictogramIconSrc, ghsPictogramLabel } from '../shared/ghsPictograms';
import { useAuth } from '../../context/AuthContext';
import { hasRoleAtLeast } from '../shared/roles';
import { SdsCorrectDialog } from './SdsCorrectDialog';

const FRAME_HEIGHT = { xs: '70dvh', sm: '80dvh' };
// How long before offering to open the document in its own tab
const SLOW_LOAD_MS = 10_000;

// The Drive preview, with a skeleton over it until the frame loads. That
// covers the blank white frame before Drive's viewer appears; Drive then
// shows its own spinner while it draws the PDF, which can't be seen from
// here (the frame is cross-origin). Keyed by drive_id by the caller, so a
// different document starts loading afresh.
const SdsFrame = ({ src, title }: { src: string; title: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  return (
    <Box sx={{ position: 'relative', height: FRAME_HEIGHT }}>
      {!loaded && (
        <Stack
          spacing={1}
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            // Opaque: the Skeleton alone is translucent, and the half-loaded
            // frame would show through
            bgcolor: 'background.default',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Skeleton variant="rounded" sx={{ position: 'absolute', inset: 0, height: '100%' }} />
          {slow && (
            <Typography variant="body2" sx={{ position: 'relative' }}>
              Taking a while?{' '}
              <Link href={src} target="_blank" rel="noopener">
                Open the document in a new tab
              </Link>
            </Typography>
          )}
        </Stack>
      )}
      <Box
        component="iframe"
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        sx={{ width: '100%', height: '100%', border: 'none', borderRadius: 1 }}
      />
    </Box>
  );
};

// Fully public — no login, matching the "SDS viewing is public safety
// information" decision. Embeds the document itself via Drive's own
// inline-preview endpoint (view_url) so nobody has to leave the site to
// read it.
export const SdsViewer = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const canCorrect = hasRoleAtLeast(user, 'stockroom');
  const [correctOpen, setCorrectOpen] = useState(false);

  const {
    data: sds,
    isPending,
    isError,
  } = useQuery({
    queryKey: sdsKeys.detail(id ?? ''),
    queryFn: () => getSdsById(id!),
    enabled: !!id,
  });

  if (isError) return <NotFound />;
  if (isPending || !sds) {
    // The page's shape while the record loads: name, file line, document
    return (
      <Container sx={{ py: { xs: 2, sm: 3 } }}>
        <SafetyHeader />
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Skeleton variant="text" sx={{ fontSize: '1.5rem', width: '40%' }} />
          <Skeleton variant="text" sx={{ width: '60%' }} />
        </Stack>
        <Skeleton variant="rounded" sx={{ height: FRAME_HEIGHT }} />
      </Container>
    );
  }

  return (
    <Container sx={{ py: { xs: 2, sm: 3 } }}>
      <SafetyHeader />
      <Stack spacing={1} sx={{ mb: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5">{sds.container.name}</Typography>
          {canCorrect && (
            <Button startIcon={<EditNote />} onClick={() => setCorrectOpen(true)}>
              Correct
            </Button>
          )}
        </Stack>
        {canCorrect && (
          <SdsCorrectDialog sds={sds} open={correctOpen} onClose={() => setCorrectOpen(false)} />
        )}
        <Typography variant="body2" color="text.secondary">
          {sds.file_name}
          {sds.revision_date && ` · Rev. date ${sds.revision_date}`}
          {sds.revision_number != null && ` · Rev. # ${sds.revision_number}`}
        </Typography>
        {sds.ghs_pictograms && sds.ghs_pictograms.length > 0 && (
          // Shown as a proper legend (image + label), not a text Chip —
          // this is the one page where someone might actually be trying to
          // visually match a hazard symbol against the container in front
          // of them, so the real pictogram deserves to be legible.
          <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', mt: 1 }}>
            {sds.ghs_pictograms.map((p) => (
              <Stack key={p} spacing={0.5} sx={{ alignItems: 'center', width: 72 }}>
                <Box
                  component="img"
                  src={ghsPictogramIconSrc(p)}
                  alt={ghsPictogramLabel(p)}
                  // Transparent-background PNGs — the pictogram's own black
                  // glyph would otherwise vanish against a dark-mode page.
                  // GHS pictograms are always shown on white in the wild
                  // anyway, so a fixed white backing (not theme-following)
                  // matches how they're actually printed on a label.
                  sx={{
                    width: 48,
                    height: 48,
                    bgcolor: 'common.white',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    p: 0.5,
                    boxSizing: 'border-box',
                  }}
                />
                <Typography variant="caption" align="center">
                  {ghsPictogramLabel(p)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
      <SdsFrame key={sds.drive_id} src={sds.view_url} title={sds.file_name} />
    </Container>
  );
};
