import {
  Avatar,
  Chip,
  FormControl,
  InputLabel,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  Stack,
} from '@mui/material';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { GHSPictogram } from '../../types';
import { GHS_PICTOGRAMS, ghsPictogramIconSrc, ghsPictogramLabel } from '../shared/ghsPictograms';

type GhsPictogramSelectProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
};

// Multi-select of GHS pictograms, each shown with its symbol, wired to a
// react-hook-form field holding GHSPictogram[]. Used wherever an SDS is
// attached or corrected.
export function GhsPictogramSelect<TFieldValues extends FieldValues>({
  control,
  name,
}: GhsPictogramSelectProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormControl>
          <InputLabel id={`${name}-label`}>GHS Pictograms</InputLabel>
          <Select
            {...field}
            multiple
            labelId={`${name}-label`}
            label="GHS Pictograms"
            renderValue={(selected) => (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {(selected as GHSPictogram[]).map((value) => (
                  <Chip
                    key={value}
                    avatar={
                      // Transparent-background PNGs — bgcolor keeps the glyph
                      // visible in dark mode (see SdsViewer's fuller comment
                      // on the same fix).
                      <Avatar
                        src={ghsPictogramIconSrc(value)}
                        alt=""
                        sx={{ bgcolor: 'common.white' }}
                      />
                    }
                    label={ghsPictogramLabel(value)}
                    size="small"
                  />
                ))}
              </Stack>
            )}
          >
            {GHS_PICTOGRAMS.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                <ListItemAvatar>
                  <Avatar
                    src={ghsPictogramIconSrc(p.value)}
                    alt=""
                    sx={{ width: 28, height: 28, bgcolor: 'common.white' }}
                  />
                </ListItemAvatar>
                <ListItemText primary={p.label} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    />
  );
}
