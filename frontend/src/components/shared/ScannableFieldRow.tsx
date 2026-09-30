import { Add, Remove } from '@mui/icons-material';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import type { RefObject } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormClearErrors,
} from 'react-hook-form';
import { parseBarcode } from './parseBarcode';

type ScannableFieldRowProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  rules?: RegisterOptions<TFieldValues, TName>;
  clearErrors: UseFormClearErrors<TFieldValues>;
  // Called with the parsed id once a full barcode scan completes, plus a
  // setter for this row's own field value — the caller decides what a scan
  // means. The common case is dedupe-then-set-then-append a new row, but a
  // scan doesn't always target this field at all (e.g. Transfer's location
  // barcode sets a different field entirely and leaves this one blank),
  // so setting the value is opt-in rather than automatic.
  onScan: (scannedId: string, setFieldValue: (value: string) => void) => void;
  showRemove: boolean;
  onAdd: () => void;
  onRemove: () => void;
  autoFocus?: boolean;
  // Must be ONE ref shared across every row in the array (declared once by
  // the parent), not created per-row. A completed scan here can append a
  // new row, whose autoFocus shifts focus there before the scanner's
  // trailing Enter arrives — that Enter needs to be swallowed by whichever
  // row now has focus, not the row that was actually scanned into.
  justScannedRef: RefObject<boolean>;
};

// A field-array row for barcode-scannable text fields — shared by
// Checkout.tsx and Transfer.tsx. Handles masking the input while a scan is
// mid-stream (the raw JSON shouldn't be visible on screen character-by-
// character as the scanner "types" it), swallowing the scanner's own
// trailing Enter keystroke, and the add/remove row controls.
export function ScannableFieldRow<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  rules,
  clearErrors,
  onScan,
  showRemove,
  onAdd,
  onRemove,
  autoFocus = true,
  justScannedRef,
}: ScannableFieldRowProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState: { error } }) => {
        const value = typeof field.value === 'string' ? field.value : '';
        // Hides the raw JSON while a scan is mid-stream via CSS (color),
        // not by masking the `value` prop itself. A controlled input's
        // rendered text and its actual DOM value are the same property —
        // masking `value` to '' would force the browser's own accumulated
        // keystrokes back to blank on every render, breaking parseBarcode
        // before it ever sees the complete JSON. This way the field keeps
        // accumulating normally; only its visibility changes.
        const midScan = value.includes('{');
        return (
          <TextField
            {...field}
            value={value}
            label={label}
            error={!!error}
            helperText={error?.message}
            fullWidth
            autoFocus={autoFocus}
            sx={
              midScan
                ? {
                    '& .MuiInputBase-input': {
                      color: 'transparent',
                      caretColor: 'transparent',
                    },
                  }
                : undefined
            }
            onChange={(e) => {
              const scannedId = parseBarcode(e.target.value);
              justScannedRef.current = !!scannedId;
              if (scannedId) {
                onScan(scannedId, field.onChange);
              } else {
                field.onChange(e);
              }
              clearErrors(name);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && justScannedRef.current) {
                e.preventDefault();
                justScannedRef.current = false;
              }
            }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {showRemove && (
                      <IconButton onClick={onRemove}>
                        <Remove />
                      </IconButton>
                    )}
                    <IconButton onClick={onAdd}>
                      <Add />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        );
      }}
    />
  );
}
