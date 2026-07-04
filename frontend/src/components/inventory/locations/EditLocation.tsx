import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { editLocation, getLocationMenu, getLocationTypes } from '../../../api/inventory';
import { Controller, useForm } from 'react-hook-form';
import type { Location } from '../../../types';
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

type EditLocationProps = {
  location: Location;
  parent?: Location;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export type EditLocationDefaults = {
  name: string;
  type: string;
  parent: string;
};

export const EditLocation = ({ location, parent, open, setOpen }: EditLocationProps) => {
  const qc = useQueryClient();

  const { data: types } = useQuery({
    queryKey: ['locationTypes'],
    queryFn: getLocationTypes,
  });

  const { data: locations } = useQuery({
    queryKey: ['locationMenu'],
    queryFn: getLocationMenu,
  });

  const { control, clearErrors, handleSubmit, reset } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      name: location.name ? location.name : '',
      type: location.type.id ? String(location.type.id) : '',
      parent: parent?.id ? String(parent?.id) : '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: EditLocationDefaults) => {
      return editLocation(data, String(location.id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locationData'] });
      setOpen(false);
      reset();
    },
  });

  const onSubmit = (data: EditLocationDefaults) => {
    mutation.mutate(data);
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
      <DialogTitle>Edit Location</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 2 }}>
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
                select
                slotProps={{
                  select: {
                    MenuProps: {
                      slotProps: {
                        paper: {
                          sx: {
                            maxHeight: 200,
                          },
                        },
                      },
                    },
                  },
                }}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              >
                {types?.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="parent"
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                label="Parent"
                error={!!error}
                helperText={error?.message}
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
                select
                slotProps={{
                  select: {
                    MenuProps: {
                      slotProps: {
                        paper: {
                          sx: {
                            maxHeight: 200,
                          },
                        },
                      },
                    },
                  },
                }}
              >
                <MenuItem value={''}>No parent</MenuItem>
                {locations
                  ?.filter((l) => {
                    return String(l.id) !== String(location.id);
                  })
                  .map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.full_path}
                    </MenuItem>
                  ))}
              </TextField>
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit">Submit</Button>
        <Button
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
