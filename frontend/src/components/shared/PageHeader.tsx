import { Search } from '@mui/icons-material';
import { Box, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle: string;
  // Beside the title: an add button, and any dialog it opens
  titleActions?: ReactNode;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
};

// A list page's heading, with its search box to the right. The search wraps
// under the heading when they don't both fit, as on a phone.
export const PageHeader = ({ title, subtitle, titleActions, search }: PageHeaderProps) => (
  <Stack
    direction="row"
    useFlexGap
    sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 1.5, mb: 3 }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' } }}>
          {title}
        </Typography>
        {titleActions}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    </Box>
    {search && (
      <TextField
        type="search"
        size="small"
        placeholder={search.placeholder}
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        sx={{ ml: 'auto', flex: { xs: '1 1 100%', sm: '0 1 300px' }, minWidth: { sm: 260 } }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
    )}
  </Stack>
);
