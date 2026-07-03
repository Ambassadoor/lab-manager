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
import { addLocation, getLocationTypes } from '../../../api/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type AddLocationProps = {
  id?: string;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export type NewLocationDefaults = {
  name: string;
  type: string;
};

export const AddLocation = ({ id, open, setOpen }: AddLocationProps) => {
  const { data: locationTypes } = useQuery({
    queryKey: ['locationTypes'],
    queryFn: getLocationTypes,
  });

  const { control, clearErrors, handleSubmit, reset } = useForm({
    defaultValues: {
      name: '',
      type: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onBlur',
  });

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (variables: { data: NewLocationDefaults; id: string }) =>
      addLocation(variables.data, variables.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locationData'] });
      setOpen(false);
      reset();
    },
  });

  const onSubmit = (data: NewLocationDefaults) => {
    mutation.mutate({ data: data, id: id || '' });
  };

  return (
    <Dialog
      open={open}
      component={'form'}
      onSubmit={handleSubmit(onSubmit)}
      onClose={() => {
        setOpen((prev) => !prev);
        reset();
      }}
    >
      <DialogTitle>Add Location</DialogTitle>
      <DialogContent>
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
            name="type"
            rules={{
              required: {
                value: true,
                message: 'Required',
              },
            }}
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                label="Type"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
                select
              >
                {locationTypes &&
                  locationTypes.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
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
        <Button variant="outlined" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
