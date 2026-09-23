import { InputAdornment, MenuItem, Select, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  Controller,
  get,
  useFormState,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormClearErrors,
} from 'react-hook-form';
import { getContainerMetaData } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';

type QuantityUnitFieldProps<
  TFieldValues extends FieldValues,
  TQuantity extends FieldPath<TFieldValues>,
  TUnit extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  quantityName: TQuantity;
  unitName: TUnit;
  label: string;
  quantityRules?: RegisterOptions<TFieldValues, TQuantity>;
  unitRules?: RegisterOptions<TFieldValues, TUnit>;
  clearErrors: UseFormClearErrors<TFieldValues>;
};

// A quantity input with its unit picker built into the end of the field.
// The unit has no label/underline of its own so it reads as part of the one
// outlined field, and its validation message is merged into the shared
// helper text (it has no helper text of its own to show it in). Unit choices
// come from the container OPTIONS metadata — a shared, cached query.
export function QuantityUnitField<
  TFieldValues extends FieldValues,
  TQuantity extends FieldPath<TFieldValues>,
  TUnit extends FieldPath<TFieldValues>,
>({
  control,
  quantityName,
  unitName,
  label,
  quantityRules,
  unitRules,
  clearErrors,
}: QuantityUnitFieldProps<TFieldValues, TQuantity, TUnit>) {
  const { data: metaData, isPending } = useQuery({
    queryKey: containerKeys.metaData(),
    queryFn: getContainerMetaData,
  });
  const unitChoices = metaData?.actions.POST.quantity_unit.choices ?? [];

  const { errors } = useFormState({ control, name: unitName });
  const unitError: string | undefined = get(errors, unitName)?.message;

  return (
    <Controller
      control={control}
      name={quantityName}
      rules={quantityRules}
      render={({ field, fieldState: { error } }) => (
        <TextField
          {...field}
          label={label}
          error={!!error || !!unitError}
          helperText={[error?.message, unitError].filter(Boolean).join('. ')}
          onChange={(e) => {
            field.onChange(e);
            clearErrors(quantityName);
          }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Controller
                    control={control}
                    name={unitName}
                    rules={unitRules}
                    render={({ field: unitField }) => (
                      <Select
                        {...unitField}
                        // '' until the choices load, so MUI doesn't warn
                        // about a value that isn't in the (empty) list yet
                        value={
                          unitChoices.some((c) => c.value === unitField.value)
                            ? unitField.value
                            : ''
                        }
                        onChange={(e) => {
                          unitField.onChange(e);
                          clearErrors(unitName);
                        }}
                        variant="standard"
                        disableUnderline
                        disabled={isPending}
                        displayEmpty
                        renderValue={(v) => v || 'Unit'}
                        inputProps={{ 'aria-label': 'Unit' }}
                        MenuProps={{ slotProps: { paper: { sx: { maxHeight: 200 } } } }}
                      >
                        {unitChoices.map((c) => (
                          <MenuItem key={c.value} value={c.value}>
                            {c.display_name}
                          </MenuItem>
                        ))}
                      </Select>
                    )}
                  />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}
