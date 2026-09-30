import { Button, CardContent, LinearProgress, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { Container } from '../../types';
import { DetailRow } from '../shared/DetailRow';
import { useContainerSdsFallback } from '../../hooks/useContainerSdsFallback';

// Matches the Dashboard's "restock soon" cutoff (see Containers.tsx filterByView)
const RESTOCK_PERCENT = 10;

const RemainingBar = ({ percent }: { percent: number }) => (
  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
    <LinearProgress
      variant="determinate"
      // Clamped — a reading above the initial weight can compute past 100%
      value={Math.min(Math.max(percent, 0), 100)}
      color={percent <= RESTOCK_PERCENT ? 'error' : 'primary'}
      sx={{ flexGrow: 1, maxWidth: 200, height: 8, borderRadius: 4 }}
    />
    <span>{percent}%</span>
  </Stack>
);

type ContainerViewProps = {
  container: Container;
  // The full page's weigh-in table already shows the latest reading, so
  // only the drawer/preview (which have no table) show it here
  showCurrentWeight?: boolean;
};

// Read-only body of ContainerDetail's card
export const ContainerView = ({ container, showCurrentWeight }: ContainerViewProps) => {
  const sdsFallback = useContainerSdsFallback(container);

  // A tare weight of 0 (or less) is a placeholder, not a real container
  // weight — the backend treats it the same as missing (see
  // Container.has_estimated_usage) — so it shows as "Not set".
  const tareWeight = container.tare_weight ? parseFloat(container.tare_weight) : 0;

  return (
    <CardContent>
      <Stack spacing={1.5}>
        <DetailRow label="Location">
          {container.location && (
            <Link
              component={RouterLink}
              to={`/inventory/locations?location=${container.location.id}`}
            >
              {container.location.full_path}
            </Link>
          )}
        </DetailRow>
        <DetailRow label="Manufacturer">{container.manufacturer}</DetailRow>
        <DetailRow label="Product #">{container.product_num}</DetailRow>
        <DetailRow label="Quantity">{container.quantity}</DetailRow>
        <DetailRow label="Tare Weight">{tareWeight ? `${tareWeight} g` : 'Not set'}</DetailRow>
        {showCurrentWeight && container.latest_reading && (
          <DetailRow label="Current Weight">
            {parseFloat(container.latest_reading.weight)} g
          </DetailRow>
        )}
        {/* != null, not truthiness — 0% remaining is exactly the value that
            most needs showing */}
        {container.percent_remaining != null && (
          <DetailRow label="Remaining">
            <RemainingBar percent={Number(container.percent_remaining)} />
          </DetailRow>
        )}
        <DetailRow label="SDS">
          {container.latest_sds ? (
            <Button size="small" component={RouterLink} to={`/sds/${container.latest_sds.id}`}>
              View SDS
            </Button>
          ) : sdsFallback.sds.length > 0 ? (
            <Typography variant="body2" color="text.secondary">
              None on file for this container — see{' '}
              {sdsFallback.sds.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ', '}
                  <Link component={RouterLink} to={`/sds/${s.id}`}>
                    {s.file_name}
                  </Link>
                </span>
              ))}{' '}
              for this chemical.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              None on file.
            </Typography>
          )}
        </DetailRow>
      </Stack>
    </CardContent>
  );
};
