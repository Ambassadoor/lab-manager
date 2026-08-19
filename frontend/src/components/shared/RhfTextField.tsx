import { InputAdornment, TextField } from '@mui/material';
import type { ReactNode } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormClearErrors,
} from 'react-hook-form';

type RhfTextFieldProps<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> = {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  rules?: RegisterOptions<TFieldValues, TName>;
  clearErrors: UseFormClearErrors<TFieldValues>;
  endAdornment?: ReactNode;
  fullWidth?: boolean;
};

// Controller-wired TextField for the common case: bare field, its own
// error/helperText, clearErrors on change. Fields that need cross-field
// error merging (e.g. initial_quantity + quantity_unit) or a nested
// Controller inside the adornment (e.g. the unit Select) stay hand-written.
export function RhfTextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  rules,
  clearErrors,
  endAdornment,
  fullWidth,
}: RhfTextFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          label={label}
          fullWidth={fullWidth}
          error={!!error}
          helperText={error?.message || ''}
          onChange={(e) => {
            field.onChange(e);
            clearErrors(name);
          }}
          slotProps={
            endAdornment
              ? {
                  input: {
                    endAdornment: <InputAdornment position="end">{endAdornment}</InputAdornment>,
                  },
                }
              : undefined
          }
        />
      )}
    />
  );
}
