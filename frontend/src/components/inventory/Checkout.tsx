import { Close } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  IconButton,
  Snackbar,
  Stack,
} from '@mui/material';
import { useFieldArray, useForm, type SubmitHandler } from 'react-hook-form';
import { checkIfDiscarded, checkOutContainers } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ScannableFieldRow } from '../shared/ScannableFieldRow';

//Component for marking a container as checked out
export const Checkout = () => {
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

  // Shared across every row (not created per-row) — a completed scan on one
  // row can append a new row whose autoFocus shifts focus there before the
  // scanner's trailing Enter arrives, so whichever row has focus needs to
  // see the same ref to know it should swallow that Enter.
  const justScannedRef = useRef(false);

  const qc = useQueryClient();
  const onSubmit: SubmitHandler<CheckoutDefaults> = async (data) => {
    const slugs = data.checkout
      .map((d) => d.value.trim().toLocaleLowerCase())
      .filter((slug) => slug.length > 0);
    if (slugs.length === 0) return;
    const response = await checkOutContainers(slugs);
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
          title={'Checkout'}
          subheader={`Add ID's of containers you are checking out. i.e. Chem-43`}
        ></CardHeader>
        <CardContent>
          <Stack spacing={2}>
            {fields.map((field, index) => (
              <ScannableFieldRow
                key={field.id}
                control={control}
                name={`checkout.${index}.value`}
                label={`Item #${index + 1}`}
                clearErrors={clearErrors}
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
                        return `This container has been discarded. Cannot check out.`;
                      } else if (response.is_valid === false) return 'Invalid ID';
                    },
                  },
                }}
                onScan={(scannedId, setFieldValue) => {
                  const isDuplicate = getValues('checkout').some(
                    (c) => c.value.toLocaleLowerCase() === scannedId.toLocaleLowerCase()
                  );
                  if (isDuplicate) {
                    resetField(`checkout.${index}.value`);
                    return;
                  }
                  setFieldValue(scannedId);
                  append({ value: '' });
                }}
                showRemove={index > 0}
                onRemove={() => remove(index)}
                onAdd={() => {
                  append({ value: '' });
                  setFocus(`checkout.${fields.length}.value`);
                }}
                justScannedRef={justScannedRef}
              />
            ))}
          </Stack>
        </CardContent>
        <CardActions>
          <Button type="submit" variant="contained">
            {'Checkout'}
          </Button>
          <Button variant="outlined" onClick={() => resetField('checkout')}>
            Cancel
          </Button>
        </CardActions>
      </Card>
    </Box>
  );
};
