import { Alert, Box, CardContent, Stack } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { updateContainer } from '../../api/inventory';
import { containerKeys, locationKeys } from '../../api/queryKeys';
import type { Container, ContainerDetailDefaults } from '../../types';
import { applyApiErrors } from '../shared/applyApiErrors';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { FormActions } from '../shared/FormActions';
import { decimalPatternRule, requiredRule } from '../shared/formRules';
import { LocationSelect } from '../shared/LocationSelect';
import { QuantityUnitField } from '../shared/QuantityUnitField';
import { RhfTextField } from '../shared/RhfTextField';
import { StorageConflictWarnings } from '../shared/StorageConflictWarnings';
import { useStorageConflictConfirm } from '../shared/useStorageConflictConfirm';

// Two related fields side by side, wrapping to one column when the card is
// too narrow for both (e.g. the Locations preview panel)
const FieldPair = ({ children }: { children: ReactNode }) => (
  <Box
    sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2 }}
  >
    {children}
  </Box>
);

type ContainerEditFormProps = {
  container: Container;
  // Called on Cancel and after a successful save
  onDone: () => void;
};

// Edit-mode body of ContainerDetail's card. Only mounted while editing, so
// the form's defaults are simply the container as it is when editing starts —
// Cancel just unmounts it, discarding any changes.
export const ContainerEditForm = ({ container, onDone }: ContainerEditFormProps) => {
  const queryClient = useQueryClient();
  const storageConflict = useStorageConflictConfirm();

  // A tare weight of 0 (or less) is a placeholder, not a real container
  // weight (see ContainerView) — so it edits from a blank field.
  const tareWeight = container.tare_weight ? parseFloat(container.tare_weight) : 0;

  const {
    control,
    clearErrors,
    setError,
    handleSubmit,
    formState: { isDirty, isSubmitting },
  } = useForm<ContainerDetailDefaults>({
    mode: 'onBlur',
    // All text, matching what the inputs hand back — otherwise e.g. a
    // numeric 500 vs a typed "500" reads as a change and keeps Save enabled
    defaultValues: {
      name: container.name,
      location: container.location ? String(container.location.id) : '',
      manufacturer: container.manufacturer ?? '',
      product_num: container.product_num ?? '',
      initial_quantity:
        container.initial_quantity != null ? String(container.initial_quantity) : '',
      quantity_unit: container.quantity_unit ?? '',
      tare_weight: tareWeight ? String(tareWeight) : '',
    },
  });

  // Errors that aren't a storage conflict and don't belong to one field
  const [submitError, setSubmitError] = useState<string | null>(null);

  const doSubmit = async (formData: ContainerDetailDefaults, confirmed?: boolean) => {
    setSubmitError(null);
    try {
      await updateContainer(
        container.slug,
        { ...formData, tare_weight: formData.tare_weight?.trim() || null },
        confirmed
      );
    } catch (e) {
      if (storageConflict.intercept(e, () => doSubmit(formData, true))) return;
      setSubmitError(applyApiErrors(e, formData, setError));
      return;
    }
    queryClient.invalidateQueries({ queryKey: containerKeys.all });
    // Locations' per-location container lists live under locationKeys, and
    // an edit can move the container to a different location.
    queryClient.invalidateQueries({ queryKey: locationKeys.all });
    onDone();
  };

  return (
    <Box component="form" onSubmit={handleSubmit((formData) => doSubmit(formData))}>
      <ConfirmDialog
        open={storageConflict.isOpen}
        title="Storage Conflict"
        message={
          storageConflict.warnings && (
            <StorageConflictWarnings warnings={storageConflict.warnings} />
          )
        }
        confirmLabel="Store anyway"
        confirmColor="warning"
        onCancel={storageConflict.cancel}
        onConfirm={storageConflict.confirm}
      />
      <CardContent>
        <Stack spacing={2}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}
          <RhfTextField
            control={control}
            name="name"
            label="Name"
            rules={{ required: requiredRule }}
            clearErrors={clearErrors}
            fullWidth
          />
          <LocationSelect
            control={control}
            name="location"
            label="Location"
            rules={{ required: requiredRule }}
            clearErrors={clearErrors}
          />
          <FieldPair>
            <RhfTextField
              control={control}
              name="manufacturer"
              label="Manufacturer"
              clearErrors={clearErrors}
            />
            <RhfTextField
              control={control}
              name="product_num"
              label="Product #"
              clearErrors={clearErrors}
            />
          </FieldPair>
          <FieldPair>
            <QuantityUnitField
              control={control}
              quantityName="initial_quantity"
              unitName="quantity_unit"
              label="Quantity"
              clearErrors={clearErrors}
            />
            <RhfTextField
              control={control}
              name="tare_weight"
              label="Tare Weight"
              endAdornment="g"
              helperText="Weight of the empty container"
              rules={{
                pattern: decimalPatternRule('Please input an integer or decimal'),
                validate: (v) =>
                  !v || Number(v) > 0 || 'Must be greater than 0 (leave blank if unknown)',
              }}
              clearErrors={clearErrors}
            />
          </FieldPair>
        </Stack>
      </CardContent>
      <FormActions onCancel={onDone} isDirty={isDirty} loading={isSubmitting} />
    </Box>
  );
};
