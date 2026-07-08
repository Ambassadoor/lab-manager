import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useForm } from 'react-hook-form';
import { addChemical, getChemicalByCas, getStorageCategories } from '../../../api/inventory';
import { cas_is_valid } from '../../shared/checkCas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type AddChemicalProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export type ChemicalDefaults = {
  name: string;
  cas: string;
  molecular_weight?: string;
  formula?: string;
  storage_category?: string;
};

//Modal for in page addition of new chemicals
export const AddChemical = ({ open, setOpen }: AddChemicalProps) => {
  const { data: storageCategory } = useQuery({
    queryKey: ['storageCategoryData'],
    queryFn: getStorageCategories,
  });

  const { handleSubmit, control, reset, clearErrors } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      name: '',
      molecular_weight: '',
      cas: '',
      formula: '',
      storage_category: '',
    },
  });

  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: addChemical,
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['chemicalData'],
      });
    },
  });

  const onSubmit = (data: ChemicalDefaults) => {
    mutation.mutate(data);
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      fullWidth
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      disableRestoreFocus
    >
      <DialogTitle>Add Chemical</DialogTitle>
      <DialogContent>
        <Stack
          spacing={2}
          sx={{
            mt: 2,
          }}
        >
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
              <TextField
                {...field}
                label="Name"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
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
                  const chem = await getChemicalByCas(value);
                  if (chem.chemicals.length > 0) return 'A chemical with this CAS # already exists';
                },
              },
            }}
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                label="CAS #"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
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
              <TextField
                {...field}
                label="Molecular Weight"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="formula"
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                label="Chemical Formula"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="storage_category"
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                select
                label="Storage Category"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
                slotProps={{
                  select: {
                    MenuProps: {
                      sx: {
                        maxHeight: '400px',
                      },
                    },
                  },
                }}
              >
                {storageCategory?.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.shorthand}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained">
          Submit
        </Button>
        <Button
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
