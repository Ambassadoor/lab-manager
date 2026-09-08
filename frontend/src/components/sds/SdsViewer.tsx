import { Box, Chip, Container, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSdsById } from '../../api/sds';
import { sdsKeys } from '../../api/queryKeys';
import { SafetyHeader } from './SafetyHeader';
import { NotFound } from '../shared/NotFound';
import { ghsPictogramLabel } from '../shared/ghsPictograms';

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
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {sds.ghs_pictograms.map((p) => (
              <Chip key={p} label={ghsPictogramLabel(p)} size="small" color="warning" />
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
