import {
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Container,
  IconButton,
  Stack,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router-dom';
import {
  getChemicalByCas,
  getChemicalById,
  getStorageCategories,
  updateChemical,
} from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import { Controller, useForm } from 'react-hook-form';
import { ToggleField } from '../../shared/ToggleField';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { Edit } from '@mui/icons-material';
import type { ChemicalDefaults } from './AddChemical';
import { cas_is_valid } from '../../shared/checkCas';
import { NotFound } from '../../shared/NotFound';

//Convertible detail/edit component for chemicals
export const ChemicalDetail = () => {
  const [editing, setEditing] = useState(false);
  const location = useLocation();
  const { chemId } = useParams();

  const seed = location.state ?? undefined;

  // Checked locally rather than via throwOnError — a missing chemical id is
  // an expected 404, not an unexpected crash, and should show the friendly
  // NotFound page rather than App.tsx's generic error page (see
  // ContainerDetail.tsx, same pattern; and client.ts, why 404 isn't special
  // any more).
  const {
    data: chemical,
    isPending,
    isError,
  } = useQuery({
    queryKey: chemicalKeys.detail(chemId ?? ''),
    queryFn: () => getChemicalById(chemId!),
    enabled: !!chemId,
    initialData: seed,
  });

  const { data: storageCategories } = useQuery({
    queryKey: chemicalKeys.storageCategories(),
    queryFn: getStorageCategories,
    throwOnError: true,
  });

  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ data, id }: { data: ChemicalDefaults; id: string }) => updateChemical(data, id),
    onSuccess: () => {
      // .all — an edit here can also change what shows in the Chemicals list
      qc.invalidateQueries({
        queryKey: chemicalKeys.all,
      });
      setEditing(false);
    },
  });

  const {
    control,
    clearErrors,
    handleSubmit,
    formState: { dirtyFields, isValidating },
  } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    values: chemical,
    defaultValues: {
      name: chemical?.name,
      cas: chemical?.cas,
      molecular_weight: chemical?.molecular_weight ? chemical.molecular_weight : '',
      formula: chemical?.formula ? chemical.formula : '',
      storage_category: chemical?.storage_category ? chemical.storage_category : '',
    },
  });

  const onSubmit = (data: ChemicalDefaults) => {
    mutation.mutate({ data: data, id: chemical.id });
  };

  if (isError) return <NotFound />;

  return (
    !isPending && (
      <Container>
        <Card component={'form'} onSubmit={handleSubmit(onSubmit)}>
          <CardHeader
            title={chemical?.name}
            action={
              <IconButton onClick={() => setEditing((prev) => !prev)}>
                <Edit />
              </IconButton>
            }
          />
          <CardContent>
            <Stack spacing={2}>
              <Controller
                control={control}
                name="name"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: chemical?.name,
                      label: 'Name',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {chemical?.name}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="cas"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                  pattern: {
                    value: /^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$/,
                    message: 'Invalid CAS format',
                  },
                  validate: {
                    check_digit: (value) => {
                      if (!cas_is_valid(value)) return 'Invalid CAS number';
                    },
                    duplicate: async (value) => {
                      if (!dirtyFields.cas) return;
                      const chem = await getChemicalByCas(value);
                      if (chem.chemicals.length > 0)
                        return 'A chemical with this CAS # already exists';
                    },
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: chemical?.cas,
                      label: 'CAS #',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {chemical?.cas}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="molecular_weight"
                rules={{
                  pattern: {
                    value: /^\d+(\.\d+)?$/,
                    message: 'Please input integer or decimal value.',
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: chemical?.molecular_weight,
                      label: 'Molecular Weight',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {chemical?.molecular_weight
                      ? new Decimal(chemical?.molecular_weight).toString()
                      : ''}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="formula"
                rules={{}}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: chemical?.formula,
                      label: 'Formula',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                  >
                    {chemical?.formula}
                  </ToggleField>
                )}
              />
              <Controller
                control={control}
                name="storage_category"
                rules={{}}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <ToggleField
                    {...field}
                    editing={editing}
                    textProps={{
                      fullWidth: true,
                      defaultValue: chemical?.storage_category?.id,
                      label: 'Storage Category',
                      error: !!error,
                      helperText: error?.message,
                      onChange: (e) => {
                        onChange(e);
                        clearErrors(name);
                      },
                    }}
                    options={storageCategories?.map((c) => {
                      return {
                        key: c?.id,
                        value: c?.id,
                        text: c?.shorthand,
                      };
                    })}
                  >
                    {chemical?.storage_category?.shorthand}
                  </ToggleField>
                )}
              />
            </Stack>
          </CardContent>
          {editing && (
            <CardActions>
              <Button
                type="submit"
                variant="contained"
                loading={mutation.isPending || isValidating}
              >
                Submit
              </Button>
              <Button
                onClick={() => {
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </CardActions>
          )}
        </Card>
      </Container>
    )
  );
};
