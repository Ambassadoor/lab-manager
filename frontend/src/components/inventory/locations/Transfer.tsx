import { Add, Remove } from '@mui/icons-material';
import {
  Button,
  ButtonGroup,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Container,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useRef } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { parseBarcode } from '../../shared/parseBarcode';
import { useQuery } from '@tanstack/react-query';
import { locationKeys } from '../../../api/queryKeys';
import { getLocationMenu, transferContainers } from '../../../api/inventory';

export const Transfer = () => {
  const { control, clearErrors, reset, resetField, handleSubmit, setFocus, getValues, setValue } =
    useForm({
      mode: 'onBlur',
      reValidateMode: 'onBlur',
      defaultValues: {
        location: '',
        containers: [
          {
            slug: '',
          },
        ],
      },
    });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'containers',
  });

  const { data: locationMenu } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });

  // Tracks whether the last onChange was a completed barcode scan, so we only
  // swallow the scanner's own trailing Enter keystroke, not a manual submit.
  const justScannedRef = useRef(false);

  const onSubmit = async (data: { containers: { slug: string }[]; location: string }) => {
    const response = await transferContainers(data);
    console.log(response);
  };

  return (
    <Container>
      <Card component={'form'}>
        <CardHeader
          title={'Transfer Location'}
          subheader={`Add ID's of containers you are moving.`}
        />
        <CardContent>
          <Stack spacing={2}>
            {fields.map((field, index) => (
              <Controller
                key={field.id}
                control={control}
                name={`containers.${index}.slug`}
                render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    value={field.value.includes('{') ? '' : field.value}
                    label={`Container #${index + 1}`}
                    error={!!error}
                    helperText={error?.message}
                    onChange={(e) => {
                      const scannedId = parseBarcode(e.target.value);
                      justScannedRef.current = !!scannedId;
                      if (scannedId) {
                        const isDuplicate = getValues('containers').some(
                          (c) => c.slug.toLocaleLowerCase() === scannedId.toLocaleLowerCase()
                        );
                        if (isDuplicate) {
                          resetField(name);
                          return;
                        } else if (scannedId.toLocaleLowerCase().includes('loc')) {
                          setValue('location', scannedId.split('-')[1]);
                          handleSubmit(onSubmit)();
                          resetField(name);
                          return;
                        }
                        onChange(scannedId);
                        append({ slug: '' });
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
                                append({ slug: '' });
                                setFocus(`containers.${fields.length}.slug`);
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
          <Controller
            control={control}
            name="location"
            render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
              <TextField
                {...field}
                fullWidth
                error={!!error}
                helperText={error?.message}
                label="New Location"
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
                select
                sx={{
                  mt: 2,
                }}
              >
                {locationMenu ? (
                  locationMenu.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.full_path}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem>Loading</MenuItem>
                )}
              </TextField>
            )}
          />
        </CardContent>
        <CardActions>
          <ButtonGroup sx={{ ml: 'auto' }}>
            <Button variant={'contained'} onClick={handleSubmit(onSubmit)} type="submit">
              Transfer
            </Button>
            <Button onClick={() => reset()}>Cancel</Button>
          </ButtonGroup>
        </CardActions>
      </Card>
    </Container>
  );
};
