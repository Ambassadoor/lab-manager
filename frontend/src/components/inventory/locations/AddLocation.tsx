import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { addLocation, getLocationTypes } from '../../../api/inventory';
import { locationKeys } from '../../../api/queryKeys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AcUnit,
  Add,
  Business,
  BusinessTwoTone,
  Close,
  DoorSliding,
  Inventory,
  Kitchen,
  MeetingRoom,
  Pallet,
  Shelves,
} from '@mui/icons-material';
import type { Location } from '../../../types';
import { useFullScreenOnPhone } from '../../shared/useFullScreenOnPhone';

type AddLocationProps = {
  id?: string;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Runs after the locations are saved — lets the tree expand the parent
  // row and print labels (the tree owns both, not this dialog).
  onCreated?: (created: Location[], print: boolean) => void;
};

// Request body for POST /locations/ — every name becomes a sibling
// location sharing the same parent and type.
export type NewLocationDefaults = {
  names: string[];
  type: string;
  parent?: string;
  new_type: {
    name: string;
    icon: string;
  } | null;
};

type AddLocationForm = {
  print: boolean;
  // Objects rather than plain strings — useFieldArray only tracks arrays of objects.
  names: { value: string }[];
  type: string;
  new_type: {
    check: boolean;
    name: string;
    icon: string;
  };
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
export const AddLocation = ({ id, open, setOpen, onCreated }: AddLocationProps) => {
  const fullScreen = useFullScreenOnPhone();
  const { data: locationTypes } = useQuery({
    queryKey: locationKeys.types(),
    queryFn: getLocationTypes,
  });

  const {
    control,
    clearErrors,
    getValues,
    handleSubmit,
    reset,
    setFocus,
    formState: { isValidating },
  } = useForm<AddLocationForm>({
    defaultValues: {
      print: true,
      names: [{ value: '' }],
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

  const { fields, append, remove } = useFieldArray({ control, name: 'names' });

  const newType = useWatch({
    control,
    name: 'new_type.check',
  });

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (variables: { data: NewLocationDefaults; print: boolean }) =>
      addLocation(variables.data),
    onSuccess: (created, { print }) => {
      // .all — a submission here can also create a new location type
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
      setOpen(false);
      reset();
      onCreated?.(created, print);
    },
  });

  const close = () => {
    setOpen(false);
    reset();
    mutation.reset();
  };

  const onSubmit = (data: AddLocationForm) => {
    mutation.mutate({
      data: {
        names: data.names.map((n) => n.value.trim()),
        type: data.type,
        parent: id || undefined,
        new_type: data.new_type.check
          ? { name: data.new_type.name, icon: data.new_type.icon }
          : null,
      },
      print: data.print,
    });
  };

  return (
    <Dialog
      fullScreen={fullScreen}
      fullWidth
      open={open}
      component={'form'}
      onSubmit={handleSubmit(onSubmit)}
      onClose={close}
      disableRestoreFocus
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', pr: 2 }}>
        <DialogTitle>{id ? 'Add Child Locations' : 'Add Locations'}</DialogTitle>
        <Controller
          control={control}
          name="print"
          render={({ field: { value, onChange, ...field } }) => (
            <FormControlLabel
              label="Print label?"
              labelPlacement="start"
              control={
                <Checkbox
                  {...field}
                  checked={!!value}
                  onChange={(e) => onChange(e.target.checked)}
                />
              }
            />
          )}
        />
      </Stack>
      <DialogContent>
        <Stack spacing={2}>
          {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
          {fields.map((field, index) => (
            <Stack key={field.id} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Controller
                control={control}
                name={`names.${index}.value`}
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                  validate: {
                    duplicate: (value) => {
                      const normalized = value.trim().toLocaleLowerCase();
                      const isDuplicate = getValues('names').some(
                        (n, i) => i !== index && n.value.trim().toLocaleLowerCase() === normalized
                      );
                      if (isDuplicate) return 'Already listed above';
                    },
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label={fields.length > 1 ? `Name #${index + 1}` : 'Name'}
                    error={!!error}
                    helperText={error?.message}
                    onChange={(e) => {
                      onChange(e);
                      clearErrors(name);
                    }}
                  />
                )}
              />
              {index > 0 && (
                <IconButton
                  aria-label={`Remove name #${index + 1}`}
                  onClick={() => remove(index)}
                  sx={{ mt: 1 }}
                >
                  <Close />
                </IconButton>
              )}
            </Stack>
          ))}
          <Button
            startIcon={<Add />}
            sx={{ alignSelf: 'flex-start' }}
            onClick={() => {
              append({ value: '' });
              setFocus(`names.${fields.length}.value`);
            }}
          >
            Add another
          </Button>
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
        <Button variant="outlined" onClick={close}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
