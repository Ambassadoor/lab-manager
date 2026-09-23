import { Alert, Box, CardContent, Stack } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateChemical } from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import type { Chemical, ChemicalDefaults } from '../../../types';
import { applyApiErrors } from '../../shared/applyApiErrors';
import { FormActions } from '../../shared/FormActions';
import { ChemicalFields } from './ChemicalFields';

type ChemicalEditFormProps = {
  chemical: Chemical;
  // Called on Cancel and after a successful save
  onDone: () => void;
};

// Edit-mode body of ChemicalDetail's card. Only mounted while editing (see
// ContainerEditForm, same pattern), so Cancel just unmounts it.
export const ChemicalEditForm = ({ chemical, onDone }: ChemicalEditFormProps) => {
  const qc = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    clearErrors,
    setError,
    handleSubmit,
    formState: { isDirty, isSubmitting },
  } = useForm<ChemicalDefaults>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    // Only the editable fields — not the whole API object, whose nested
    // storage_category {id, shorthand} the select can't hold
    defaultValues: {
      name: chemical.name,
      cas: chemical.cas ?? '',
      molecular_weight: chemical.molecular_weight ?? '',
      formula: chemical.formula || '',
      storage_category: chemical.storage_category?.id ?? '',
    },
  });

  const onSubmit = async (data: ChemicalDefaults) => {
    setSubmitError(null);
    try {
      await updateChemical(data, String(chemical.id));
    } catch (e) {
      setSubmitError(applyApiErrors(e, data, setError));
      return;
    }
    // .all — an edit here can also change what shows in the Chemicals list
    qc.invalidateQueries({ queryKey: chemicalKeys.all });
    onDone();
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)}>
      <CardContent>
        <Stack spacing={2}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}
          <ChemicalFields
            control={control}
            clearErrors={clearErrors}
            currentCas={chemical.cas ?? undefined}
          />
        </Stack>
      </CardContent>
      <FormActions onCancel={onDone} isDirty={isDirty} loading={isSubmitting} />
    </Box>
  );
};
