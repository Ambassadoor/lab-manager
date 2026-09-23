import { Stack } from '@mui/material';
import type { Control, UseFormClearErrors } from 'react-hook-form';
import { getChemicalByCas } from '../../../api/inventory';
import type { ChemicalDefaults } from '../../../types';
import { casRules, decimalPatternRule, requiredRule } from '../../shared/formRules';
import { RhfTextField } from '../../shared/RhfTextField';
import { StorageCategorySelect } from '../../shared/StorageCategorySelect';

type ChemicalFieldsProps = {
  control: Control<ChemicalDefaults>;
  clearErrors: UseFormClearErrors<ChemicalDefaults>;
  // When editing: the chemical's own CAS #, which mustn't trip the
  // "already exists" check against itself
  currentCas?: string;
};

// The chemical fields shared by AddChemical (create) and ChemicalEditForm
// (edit) — same fields, same rules, so the two can't drift apart.
export const ChemicalFields = ({ control, clearErrors, currentCas }: ChemicalFieldsProps) => {
  return (
    <Stack spacing={2}>
      <RhfTextField
        control={control}
        name="name"
        label="Name"
        rules={{ required: requiredRule }}
        clearErrors={clearErrors}
        fullWidth
      />
      <RhfTextField
        control={control}
        name="cas"
        label="CAS #"
        rules={{
          ...casRules,
          validate: {
            ...casRules.validate,
            duplicate: async (value: string) => {
              if (value === currentCas) return true;
              try {
                const chem = await getChemicalByCas(value);
                return chem.chemicals.length === 0 || 'A chemical with this CAS # already exists';
              } catch {
                return 'Unable to verify CAS number. Please try again.';
              }
            },
          },
        }}
        clearErrors={clearErrors}
        fullWidth
      />
      <RhfTextField
        control={control}
        name="molecular_weight"
        label="Molecular Weight"
        endAdornment="g/mol"
        rules={{ pattern: decimalPatternRule() }}
        clearErrors={clearErrors}
        fullWidth
      />
      <RhfTextField
        control={control}
        name="formula"
        label="Formula"
        clearErrors={clearErrors}
        fullWidth
      />
      <StorageCategorySelect control={control} name="storage_category" clearErrors={clearErrors} />
    </Stack>
  );
};
