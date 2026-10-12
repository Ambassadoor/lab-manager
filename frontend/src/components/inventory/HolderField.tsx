import { CheckCircle } from '@mui/icons-material';
import { CircularProgress, InputAdornment, Stack, TextField } from '@mui/material';
import type { CheckoutHolderState } from './useCheckoutHolder';

// The "checked out by" box on Check Out, and the name box it adds when an
// ID belongs to nobody yet. State lives in useCheckoutHolder.
export const HolderField = ({ holder }: { holder: CheckoutHolderState }) => {
  const { input, setInput, name, setName, asId, isId, lookup, matched, needsName } = holder;

  let helper = 'Their Lipscomb ID (L12345678, or scan their card) or their name';
  if (matched) helper = matched.full_name;
  else if (isId && lookup.isFetching) helper = 'Looking up…';
  else if (needsName && lookup.isError) helper = "Couldn't look the ID up: add their name below";
  else if (needsName) helper = `No account has ${asId} yet: add their name below`;

  return (
    <Stack spacing={1.5}>
      <TextField
        label="Checked out by"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        required
        helperText={helper}
        slotProps={{
          formHelperText: { sx: matched ? { color: 'success.main' } : undefined },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                {isId && lookup.isFetching && <CircularProgress size={18} />}
                {matched && <CheckCircle color="success" fontSize="small" />}
              </InputAdornment>
            ),
          },
        }}
      />
      {needsName && (
        <TextField
          label="Their name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      )}
    </Stack>
  );
};
