import { Close } from '@mui/icons-material';
import {
  Box,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import type { ScanItem } from './useScanList';

type ScanListViewProps<D> = {
  items: ScanItem<D>[];
  onRemove: (key: string) => void;
  // The name and place to show under an item's id, once looked up
  describe: (detail: D) => { primary: string; secondary?: string; warning?: string };
  // Extra fields beside a ready item (Check In's weights)
  renderExtra?: (item: ScanItem<D>) => ReactNode;
  emptyText: string;
};

// The items scanned or typed into an Actions panel, newest last, each with
// what was found for it or why it can't be used.
export function ScanListView<D>({
  items,
  onRemove,
  describe,
  renderExtra,
  emptyText,
}: ScanListViewProps<D>) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        {emptyText}
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {items.map((item) => {
        const described = item.detail !== undefined ? describe(item.detail) : null;
        return (
          <ListItem
            key={item.key}
            divider
            disableGutters
            secondaryAction={
              <IconButton
                edge="end"
                aria-label={`Remove ${item.target.label}`}
                onClick={() => onRemove(item.key)}
              >
                <Close />
              </IconButton>
            }
            sx={{ flexWrap: 'wrap', gap: 1, pr: 6 }}
          >
            <ListItemText
              sx={{ flex: '1 1 220px', minWidth: 0 }}
              primary={
                <>
                  <Typography component="span" sx={{ fontWeight: 'bold', mr: 1 }}>
                    {item.target.label}
                  </Typography>
                  {described?.primary}
                </>
              }
              secondary={
                item.status === 'loading' ? (
                  <Box
                    component="span"
                    sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}
                  >
                    <CircularProgress size={12} /> Looking up…
                  </Box>
                ) : item.status === 'error' ? (
                  <Typography component="span" variant="body2" color="error">
                    {item.error}
                  </Typography>
                ) : (
                  <>
                    {described?.secondary}
                    {described?.warning && (
                      <Typography component="span" variant="body2" color="warning.main">
                        {described.secondary ? ' · ' : ''}
                        {described.warning}
                      </Typography>
                    )}
                  </>
                )
              }
            />
            {item.status === 'ready' && renderExtra?.(item)}
          </ListItem>
        );
      })}
    </List>
  );
}
