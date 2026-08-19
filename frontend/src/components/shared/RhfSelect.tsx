import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@mui/material';
import { useId, type ReactNode } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormClearErrors,
} from 'react-hook-form';

type RhfSelectOption = {
  value: string | number;
  label: ReactNode;
};

type RhfSelectProps<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> = {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  rules?: RegisterOptions<TFieldValues, TName>;
  clearErrors: UseFormClearErrors<TFieldValues>;
  options: RhfSelectOption[];
};

// Controller-wired Select for the common FormControl + InputLabel +
// MenuProps(maxHeight 200) + FormHelperText shape. Each instance gets its
// own generated label id, so multiple selects on one page (e.g. one per
// chemical row) don't collide. Fields with custom MenuItem structure (e.g.
// location's grouped ListSubheader) or that live outside a FormControl
// (e.g. quantity_unit, nested in another field's adornment) stay
// hand-written.
export function RhfSelect<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>({
  control,
  name,
  label,
  rules,
  clearErrors,
  options,
}: RhfSelectProps<TFieldValues, TName>) {
  const labelId = useId();

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState: { error } }) => (
        <FormControl>
          <InputLabel id={labelId}>{label}</InputLabel>
          <Select
            {...field}
            // Falls back to '' (MUI's "no selection" value) instead of
            // field.value when the options haven't loaded yet — e.g. a CAS
            // lookup can setValue() a real category id before the storage
            // categories query resolves. Avoids an out-of-range warning for
            // a value that's actually valid, just not loaded yet; the real
            // field.value is untouched, so the display catches up once
            // options arrives.
            value={options.some((o) => o.value === field.value) ? field.value : ''}
            labelId={labelId}
            label={label}
            error={!!error}
            onChange={(e) => {
              field.onChange(e);
              clearErrors(name);
            }}
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    maxHeight: 200,
                  },
                },
              },
            }}
          >
            {options.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
          {error && <FormHelperText error>{error.message}</FormHelperText>}
        </FormControl>
      )}
    />
  );
}
