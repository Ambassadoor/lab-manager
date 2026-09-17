import { List, ListItem, ListItemText, Typography } from '@mui/material';

// Shared message body for the "confirm anyway" dialog every
// useStorageConflictConfirm caller shows — see that hook's comment.
export const StorageConflictWarnings = ({ warnings }: { warnings: string[] }) => (
  <>
    <Typography variant="body2" sx={{ mb: 1 }}>
      Storing this here may violate lab chemical storage rules:
    </Typography>
    <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
      {warnings.map((w) => (
        <ListItem key={w} disableGutters>
          <ListItemText primary={w} />
        </ListItem>
      ))}
    </List>
  </>
);
