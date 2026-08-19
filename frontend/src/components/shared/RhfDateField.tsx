import { DateField } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';

type RhfDateFieldProps<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>> = {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  rules?: RegisterOptions<TFieldValues, TName>;
  disableFuture?: boolean;
};

// Controller-wired DateField — coerces the stored string/Dayjs/null value
// to a Dayjs for display, once, instead of at every call site.
export function RhfDateField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({ control, name, label, rules, disableFuture }: RhfDateFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState: { error } }) => (
        <DateField
          {...field}
          label={label}
          value={dayjs(field.value)}
          clearable
          disableFuture={disableFuture}
          error={!!error}
          helperText={error?.message}
        />
      )}
    />
  );
}
