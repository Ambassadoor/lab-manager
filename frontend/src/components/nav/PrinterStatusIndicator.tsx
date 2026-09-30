import { Print } from '@mui/icons-material';
import { Badge, List, ListItem, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { getPrinterStatus } from '../../api/bridge';
import { printerKeys } from '../../api/queryKeys';

const POLL_INTERVAL_MS = 30_000;

// The PT-P950NW has no network/serial command that clears a latched error —
// confirmed against all of Brother's command references plus its own user
// guide (see bridge/PRINTER_PLAN.md, "printer errors be cleared
// programmatically"). This is the manual sequence from that guide's own
// troubleshooting chapter ("I want to reset an error").
const MANUAL_CLEAR_STEPS = [
  'Open the top cover, then close it.',
  "If that doesn't clear it, press the Feed & Cut button.",
  "If it's still not cleared, turn the printer off and back on.",
  "If it's still not cleared, it likely needs Brother support.",
];

// Small always-visible glance at printer health, meant for the nav bar.
// Two badges on one Print icon: a dot for online/error/unreachable, and a
// pill showing the currently loaded media width — hover for details, and
// for an error, how to clear it (see MANUAL_CLEAR_STEPS above).
export const PrinterStatusIndicator = (): JSX.Element => {
  const { data, error, isPending } = useQuery({
    queryKey: printerKeys.status(),
    queryFn: getPrinterStatus,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
    retry: 0,
  });

  const hasErrors = !!data && data.errors.length > 0;
  // "default" covers both still-loading and unreachable — from this
  // indicator's point of view neither is a printer error, just "can't say
  // right now" (e.g. the hardware bridge only runs on the lab PC, so this
  // is an expected, non-alarming state from any other machine).
  const dotColor = isPending || error ? 'default' : hasErrors ? 'error' : 'success';

  const title = isPending ? (
    'Checking printer status…'
  ) : error ? (
    <>
      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
        Printer status unavailable
      </Typography>
      <Typography variant="caption">{error.message}</Typography>
    </>
  ) : hasErrors ? (
    <>
      <Typography variant="body2" color="error.light" sx={{ fontWeight: 'bold' }}>
        Printer error: {data.errors.join(', ')}
      </Typography>
      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
        To clear it:
      </Typography>
      <List dense disablePadding sx={{ listStyleType: 'decimal', pl: 2 }}>
        {MANUAL_CLEAR_STEPS.map((step) => (
          <ListItem key={step} disablePadding sx={{ display: 'list-item', py: 0 }}>
            <Typography variant="caption">{step}</Typography>
          </ListItem>
        ))}
      </List>
    </>
  ) : (
    <>
      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
        Printer online
      </Typography>
      <Typography variant="caption" component="div">
        {data.media_type}, {data.media_width_mm}mm tape
      </Typography>
      <Typography variant="caption" component="div">
        Battery: {data.battery_level}
      </Typography>
    </>
  );

  return (
    <Tooltip title={title} arrow>
      <Badge
        badgeContent={data ? data.media_width_mm : undefined}
        color="default"
        // "rectangular" (MUI's own default) is meant for a square/rect
        // child like this icon — "circular" is for round avatars and
        // pulls the badge in further, covering more of the glyph
        // underneath than it needs to.
        overlap="rectangular"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        // Default badge color reads too close to the white Print icon
        // right behind it — force an opaque, clearly contrasting chip
        // instead (this badge is a size label, not a status color).
        // `>` (direct child), not a bare descendant selector — the status
        // dot below is *also* a `.MuiBadge-badge` span, just nested one
        // level deeper inside this Badge's `children` slot, so a
        // descendant selector here was overwriting the dot's color too.
        sx={{
          '& > .MuiBadge-badge': {
            backgroundColor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Badge
          variant="dot"
          color={dotColor}
          overlap="rectangular"
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {/* "inherit", not a hardcoded white — matches the nav Buttons/
              title elsewhere in Navbar.tsx. Worth being deliberate about
              here specifically: this theme's dark-mode AppBar background
              (Theme.tsx's dark primary.main) is a light lavender with
              contrastText forced to white, so a hardcoded white icon has
              much lower contrast in dark mode than in light mode. */}
          <Print aria-label="Printer status" color="inherit" />
        </Badge>
      </Badge>
    </Tooltip>
  );
};
