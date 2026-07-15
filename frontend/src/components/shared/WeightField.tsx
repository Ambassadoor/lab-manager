import { MonitorWeight } from '@mui/icons-material';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type UseFormClearErrors,
  type UseFormSetValue,
} from 'react-hook-form';
import type { BalanceReading } from '../../types';

type WeightFieldProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label?: string;
  setValue: UseFormSetValue<TFieldValues>;
  clearErrors: UseFormClearErrors<TFieldValues>;
  onError: (message: string) => void;
  // Owned by the caller (created via useMutation({ mutationFn: getBalanceWeight }))
  // rather than by this component, so a parent that needs to trigger a scale
  // read itself (e.g. right after a barcode scan) can call the exact same
  // mutation instance directly — same isPending/disabled state either way,
  // instead of two uncoordinated mutations or an imperative ref handle.
  scaleMutation: UseMutationResult<BalanceReading, Error, void>;
  // Escape hatch for a caller that needs to coordinate with a sibling
  // field (e.g. swallowing a barcode scanner's trailing Enter keystroke
  // that lands here after a scan on another field shifts focus).
  onKeyDown?: TextFieldProps['onKeyDown'];
};

// Weight TextField wired to the USB balance's "read from scale" button —
// shared by WeighIn.tsx and ContainerForm.tsx, which both want the exact
// same scale-reading behavior on a differently-named field.
export function WeightField<TFieldValues extends FieldValues>({
  control,
  name,
  label = 'Weight',
  setValue,
  clearErrors,
  onError,
  scaleMutation,
  onKeyDown,
}: WeightFieldProps<TFieldValues>) {
  const readScale = () => {
    scaleMutation.mutate(undefined, {
      onSuccess: (reading) => {
        setValue(name, String(reading.weight) as TFieldValues[typeof name]);
        clearErrors(name);
      },
      onError: (error) => {
        onError(error.message);
      },
    });
  };

  return (
    <Controller
      control={control}
      name={name}
      rules={{
        required: { value: true, message: 'Required' },
        pattern: { value: /^\d+(\.\d+)?$/, message: 'Please input integer or decimal value.' },
      }}
      render={({ field: { ref, ...field }, fieldState: { error } }) => (
        <TextField
          {...field}
          inputRef={ref}
          fullWidth
          error={!!error}
          helperText={error?.message}
          label={label}
          onChange={(e) => {
            field.onChange(e);
            clearErrors(name);
          }}
          onKeyDown={onKeyDown}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    type="button"
                    aria-label="Read from scale"
                    disabled={scaleMutation.isPending}
                    onClick={readScale}
                  >
                    <MonitorWeight />
                  </IconButton>
                  g
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}
