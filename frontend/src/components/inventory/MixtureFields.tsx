import { Box, Divider, Stack } from '@mui/material';
import type { Control, UseFormClearErrors } from 'react-hook-form';
import type { Chemical, ContainerFormDefaults } from '../../types';
import { RhfTextField } from '../shared/RhfTextField';
import { RhfSelect } from '../shared/RhfSelect';
import { StorageCategorySelect } from '../shared/StorageCategorySelect';
import { requiredRule, required, decimalPatternRule } from '../shared/formRules';

type MixtureFieldsProps = {
  control: Control<ContainerFormDefaults>;
  clearErrors: UseFormClearErrors<ContainerFormDefaults>;
  mixtures: Chemical[] | undefined;
};

// The "multiple CAS numbers" section of ContainerForm: a picker for an
// existing mixture (when the looked-up CAS numbers match one) plus the
// name/storage category/molecular weight fields for the mixture itself.
export function MixtureFields({ control, clearErrors, mixtures }: MixtureFieldsProps) {
  return (
    <>
      {mixtures && mixtures.length > 0 && (
        <RhfSelect
          control={control}
          name="mixture_id"
          label="Select a Mixture"
          clearErrors={clearErrors}
          rules={{ required: required('Select an existing mixture, or create a new one') }}
          options={[
            { value: -1, label: 'Create New Mixture' },
            ...mixtures.map((mix) => ({ value: mix.id, label: mix.name })),
          ]}
        />
      )}
      <Box>
        <Stack spacing={2} sx={{ ml: 2 }}>
          <RhfTextField
            control={control}
            name="mixture_name"
            label="Mixture Name"
            fullWidth
            rules={{ required: requiredRule }}
            clearErrors={clearErrors}
          />
          <StorageCategorySelect
            control={control}
            name="mixture_storage_category"
            clearErrors={clearErrors}
            rules={{ required: requiredRule }}
          />
          <RhfTextField
            control={control}
            name="mixture_molecular_weight"
            label="Molecular Weight"
            rules={{ pattern: decimalPatternRule() }}
            clearErrors={clearErrors}
            endAdornment="g/mol"
          />
        </Stack>
      </Box>
      <Divider />
    </>
  );
}
