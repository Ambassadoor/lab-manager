import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { addLocation, getLocationTypes } from '../../../api/inventory';
import { locationKeys } from '../../../api/queryKeys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AcUnit,
  Business,
  BusinessTwoTone,
  DoorSliding,
  Inventory,
  Kitchen,
  MeetingRoom,
  Pallet,
  Shelves,
} from '@mui/icons-material';

type AddLocationProps = {
  id?: string;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export type NewLocationDefaults = {
  name: string;
  type: string;
  parent?: string;
  new_type: {
    check: boolean;
    name: string;
    icon: string;
  } | null;
};

const iconMap = new Map([
  ['Business', <Business />],
  ['Inventory', <Inventory />],
  ['Pallet', <Pallet />],
  ['Kitchen', <Kitchen />],
  ['AcUnit', <AcUnit />],
  ['Shelves', <Shelves />],
  ['DoorSliding', <DoorSliding />],
  ['MeetingRoom', <MeetingRoom />],
  ['BusinessTwoTone', <BusinessTwoTone />],
]);

//Modal for in page addition of locations
export const AddLocation = ({ id, open, setOpen }: AddLocationProps) => {
  const { data: locationTypes } = useQuery({
    queryKey: locationKeys.types(),
    queryFn: getLocationTypes,
  });

  const {
    control,
    clearErrors,
    handleSubmit,
    reset,
    formState: { isValidating },
  } = useForm({
    defaultValues: {
      name: '',
      type: '',
      new_type: {
        check: false,
        name: '',
        icon: '',
      },
    },
    mode: 'onBlur',
    reValidateMode: 'onBlur',
  });

  const newType = useWatch({
    control,
    name: 'new_type.check',
  });

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (variables: { data: NewLocationDefaults; id: string }) =>
      addLocation(variables.data),
    onSuccess: () => {
      // .all — a submission here can also create a new location type
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
      setOpen(false);
      reset();
    },
  });

  const onSubmit = (data: NewLocationDefaults) => {
    if (!data.new_type?.check) {
      data.new_type = null;
    }
    mutation.mutate({ data: { ...data, parent: id }, id: id || '' });
  };

  return (
    <Dialog
      fullWidth
      open={open}
      component={'form'}
      onSubmit={handleSubmit(onSubmit)}
      onClose={() => {
        setOpen((prev) => !prev);
        reset();
      }}
      disableRestoreFocus
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
            name="new_type.check"
            render={({ field: { value, onChange, ...field } }) => (
              <FormControlLabel
                label="Add New Location Type?"
                control={
                  <Checkbox
                    {...field}
                    checked={!!value}
                    onChange={(e) => {
                      onChange(e.target.checked);
                    }}
                  />
                }
              />
            )}
          />
          {!newType ? (
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
          ) : (
            <>
              <Controller
                control={control}
                name="new_type.name"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                  validate: {
                    duplicate: async (value) => {
                      if (
                        locationTypes?.filter((t) => {
                          return (
                            t.name.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase()
                          );
                        }).length
                      )
                        return 'A type of this name already exists';
                    },
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="New Type Name"
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
                name="new_type.icon"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="New Type Icon"
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
                          sx: {
                            maxHeight: '300px',
                          },
                        },
                      },
                    }}
                  >
                    {locationTypes
                      ?.reduce((a: string[], c) => {
                        if (c.icon && !a.includes(c.icon)) {
                          a.push(c.icon);
                        }
                        return a;
                      }, [])
                      .map((t) => (
                        <MenuItem key={t} value={t}>
                          {
                            <Stack direction={'row'}>
                              {iconMap.get(t)}
                              <Typography sx={{ ml: 2 }}>{t}</Typography>
                            </Stack>
                          }
                        </MenuItem>
                      ))}
                  </TextField>
                )}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained" loading={mutation.isPending || isValidating}>
          Submit
        </Button>
        <Button
          variant="outlined"
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
