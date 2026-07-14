import { Add, Close, Remove } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
} from '@mui/material';
import { Controller, useFieldArray, useForm, type SubmitHandler } from 'react-hook-form';
import { checkIfDiscarded, checkInContainers, checkOutContainers } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseBarcode } from '../shared/parseBarcode';

type CheckoutProps = {
  event: string;
};

//Component for marking a container as checked out
export const Checkout = ({ event }: CheckoutProps) => {
  const [open, setOpen] = useState(false);
  const { control, clearErrors, handleSubmit, resetField, reset, setFocus, getValues } = useForm({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      checkout: [
        {
          value: '',
        },
      ],
    },
  });

  //Dynamically add fields to allow for multiple checkouts
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'checkout',
  });

  type CheckoutDefaults = {
    checkout: { value: string }[];
  };

  // Tracks whether the last onChange was a completed barcode scan, so we only
  // swallow the scanner's own trailing Enter keystroke, not a manual submit.
  const justScannedRef = useRef(false);

  const qc = useQueryClient();
  const onSubmit: SubmitHandler<CheckoutDefaults> = async (data) => {
    const slugs = data.checkout
      .map((d) => d.value.trim().toLocaleLowerCase())
      .filter((slug) => slug.length > 0);
    if (slugs.length === 0) return;
    const response =
      event === 'out' ? await checkOutContainers(slugs) : await checkInContainers(slugs);
    if (response.events[0].id) {
      qc.invalidateQueries({
        queryKey: containerKeys.list(),
      });
      qc.invalidateQueries({
        queryKey: ['dashboardData'],
      });
      reset();
      setOpen(true);
    }
  };

  //Prevents alert closure from user clicking in the webpage
  const handleClose = (_: Event | SyntheticEvent, reason: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };

  return (
    <Box
      component={'form'}
      sx={{ display: 'flex', justifyContent: 'center' }}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Snackbar
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={6000}
        action={
          <IconButton onClick={() => setOpen(false)} color="inherit">
            <Close />
          </IconButton>
        }
      >
        <Alert
          onClose={(e) => handleClose(e, '')}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          Checkout status updated
        </Alert>
      </Snackbar>
      <Card sx={{ width: '50dvw', alignSelf: 'center' }} elevation={6}>
        <CardHeader
          title={event === 'out' ? 'Checkout' : 'Check In'}
          subheader={`Add ID's of containers you are checking ${event === 'out' ? 'out' : 'in'}. i.e. Chem-43`}
        ></CardHeader>
        <CardContent>
          <Stack spacing={2}>
            {fields.map((field, index) => (
              <Controller
                key={field.id}
                control={control}
                name={`checkout.${index}.value`}
                rules={{
                  pattern: {
                    value: /^chem-\d+$/i,
                    message: 'Must match format Chem-####',
                  },
                  validate: {
                    discarded: async (value) => {
                      if (!value || value === '') return;
                      const split = value.toLocaleLowerCase().split('-');
                      const stripped = parseInt(split[1], 10);
                      const joined = split[0] + '-' + String(stripped);
                      const response = await checkIfDiscarded(joined);
                      if (response.is_discarded === true) {
                        return `This container has been discarded. Cannot check ${event === 'out' ? 'out' : 'in'}.`;
                      } else if (response.is_valid === false) return 'Invalid ID';
                    },
                  },
                }}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    value={field.value.includes('{') ? '' : field.value}
                    error={!!error}
                    label={`Item #${index + 1}`}
                    helperText={error?.message}
                    onChange={(e) => {
                      const scannedId = parseBarcode(e.target.value);
                      justScannedRef.current = !!scannedId;
                      if (scannedId) {
                        const isDuplicate = getValues('checkout').some(
                          (c) => c.value.toLocaleLowerCase() === scannedId.toLocaleLowerCase()
                        );
                        if (isDuplicate) {
                          resetField(name);
                          return;
                        }
                        onChange(scannedId);
                        append({ value: '' });
                      } else {
                        onChange(e);
                      }
                      clearErrors(name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && justScannedRef.current) {
                        e.preventDefault();
                        justScannedRef.current = false;
                      }
                    }}
                    autoFocus
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            {index > 0 && (
                              <IconButton
                                onClick={() => {
                                  remove(index);
                                }}
                              >
                                <Remove />
                              </IconButton>
                            )}
                            <IconButton
                              onClick={() => {
                                append({ value: '' });
                                setFocus(`checkout.${fields.length}.value`);
                              }}
                            >
                              <Add />
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                )}
              />
            ))}
          </Stack>
        </CardContent>
        <CardActions>
          <Button type="submit" variant="contained">
            {event === 'out' ? 'Checkout' : 'Check In'}
          </Button>
          <Button variant="outlined" onClick={() => resetField('checkout')}>
            Cancel
          </Button>
        </CardActions>
      </Card>
    </Box>
  );
};
