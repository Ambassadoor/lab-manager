import {
  MenuItem,
  TextField,
  Typography,
  type FilledTextFieldProps,
  type OutlinedTextFieldProps,
  type StandardTextFieldProps,
  type TypographyProps,
} from '@mui/material';
import type { ReactNode } from 'react';
import { DetailRow } from './DetailRow';

type ToggleFieldProps = {
  editing: boolean;
  textProps?: FilledTextFieldProps | StandardTextFieldProps | OutlinedTextFieldProps;
  typeProps?: TypographyProps;
  children?: ReactNode;
  options?: {
    key: string | number;
    value: string | number;
    text: string;
  }[];
  // Read-only presentation: 'inline' is "**Label:** value"; 'row' is a
  // two-column DetailRow (see DetailRow.tsx). Edit mode is unaffected.
  layout?: 'inline' | 'row';
};
export const ToggleField = ({
  editing = false,
  textProps,
  typeProps,
  children,
  options,
  layout = 'inline',
}: ToggleFieldProps) => {
  return editing ? (
    <TextField
      {...textProps}
      select={options ? true : false}
      onChange={(e) => !!textProps?.onChange && textProps?.onChange(e)}
      slotProps={{
        ...textProps?.slotProps,
        select: {
          ...textProps?.slotProps?.select,
          MenuProps: {
            slotProps: {
              paper: {
                sx: {
                  maxHeight: 200,
                },
              },
            },
          },
        },
      }}
    >
      {options &&
        options.map((o) => (
          <MenuItem key={o.key} value={o.value}>
            {o.text}
          </MenuItem>
        ))}
    </TextField>
  ) : layout === 'row' ? (
    <DetailRow label={textProps?.label}>{children}</DetailRow>
  ) : (
    <Typography {...typeProps}>
      {textProps?.label && <strong>{textProps.label}: </strong>}
      {children}
    </Typography>
  );
};
