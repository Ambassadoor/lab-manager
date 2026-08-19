import { Add, ArrowDropDown, Remove } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, type Control, type UseFormClearErrors } from 'react-hook-form';
import type { ContainerFormDefaults } from '../../types';
import { cas_is_valid } from '../shared/checkCas';
import { RhfTextField } from '../shared/RhfTextField';
import { RhfSelect } from '../shared/RhfSelect';
import { requiredRule, decimalPatternRule } from '../shared/formRules';

type ChemicalRowProps = {
  control: Control<ContainerFormDefaults>;
  index: number;
  clearErrors: UseFormClearErrors<ContainerFormDefaults>;
  multipleCas: boolean;
  showRemove: boolean;
  isLast: boolean;
  onAdd: () => void;
  onRemove: () => void;
  otherCasValues: (string | undefined)[];
  storageCategoryOptions: { value: number; label: string }[];
};

// One row of ContainerForm's `chemicals` field array: the CAS input (with
// the array's add/remove controls) plus the name/molecular weight/storage
// category accordion that appears once a CAS number is entered.
export function ChemicalRow({
  control,
  index,
  clearErrors,
  multipleCas,
  showRemove,
  isLast,
  onAdd,
  onRemove,
  otherCasValues,
  storageCategoryOptions,
}: ChemicalRowProps) {
  return (
    <Stack spacing={2}>
      <Controller
        control={control}
        name={`chemicals.${index}.cas`}
        rules={{
          pattern: {
            value: /^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$/,
            message: 'Invalid CAS format',
          },
          required: requiredRule,
          validate: {
            check_digit: (value) => {
              if (!cas_is_valid(value)) return 'Invalid CAS number';
            },
            duplicate: (value) => {
              if (otherCasValues.includes(value)) return 'Duplicate CAS #';
            },
          },
        }}
        render={({ field, fieldState: { error } }) => (
          <>
            <TextField
              {...field}
              label="CAS #"
              error={!!error}
              helperText={error ? error.message : ''}
              fullWidth
              onChange={(e) => {
                field.onChange(e);
                clearErrors(`chemicals.${index}.cas`);
              }}
              slotProps={{
                input: {
                  endAdornment: multipleCas && (
                    <InputAdornment position="end">
                      {showRemove && (
                        <IconButton onClick={onRemove}>
                          <Remove />
                        </IconButton>
                      )}
                      {isLast && (
                        <IconButton onClick={onAdd}>
                          <Add />
                        </IconButton>
                      )}
                    </InputAdornment>
                  ),
                },
              }}
            />
            {field.value && (
              <Box>
                <Accordion defaultExpanded elevation={4}>
                  <AccordionSummary expandIcon={<ArrowDropDown />}>
                    <Typography component={'span'}>{`Chemical Info for ${field.value}`}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={2}>
                      <RhfTextField
                        control={control}
                        name={`chemicals.${index}.name`}
                        label="Name"
                        rules={{ required: requiredRule }}
                        clearErrors={clearErrors}
                      />
                      <RhfTextField
                        control={control}
                        name={`chemicals.${index}.molecular_weight`}
                        label="Molecular Weight"
                        rules={{ pattern: decimalPatternRule() }}
                        clearErrors={clearErrors}
                        endAdornment="g/mol"
                      />
                      <RhfSelect
                        control={control}
                        name={`chemicals.${index}.storage_category`}
                        label="Storage Category"
                        clearErrors={clearErrors}
                        options={storageCategoryOptions}
                      />
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              </Box>
            )}
          </>
        )}
      />
    </Stack>
  );
}
