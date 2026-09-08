import { Box, Container, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSdsById } from '../../api/sds';
import { sdsKeys } from '../../api/queryKeys';
import { SafetyHeader } from './SafetyHeader';
import { NotFound } from '../shared/NotFound';
import { ghsPictogramIconSrc, ghsPictogramLabel } from '../shared/ghsPictograms';

// Fully public — no login, matching the "SDS viewing is public safety
// information" decision. Embeds the document itself via Drive's own
// inline-preview endpoint (view_url) so nobody has to leave the site to
// read it.
export const SdsViewer = () => {
  const { id } = useParams();

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
  if (isPending || !sds) return null;

  return (
    <Container sx={{ py: 3 }}>
      <SafetyHeader />
      <Stack spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h5">{sds.container.name}</Typography>
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
                  sx={{ width: 48, height: 48 }}
                />
                <Typography variant="caption" align="center">
                  {ghsPictogramLabel(p)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
      <Box
        component="iframe"
        src={sds.view_url}
        title={sds.file_name}
        sx={{ width: '100%', height: '80dvh', border: 'none', borderRadius: 1 }}
      />
    </Container>
  );
};
