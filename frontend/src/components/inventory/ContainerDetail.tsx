import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Collapse,
  IconButton,
  InputAdornment,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  getContainerDetails,
  getContainerMetaData,
  getLocations,
  updateContainer,
} from '../../api/inventory';
import type { Location, Container, ContainerOptions, ContainerDetailDefaults } from '../../types';
import { Edit, ExpandLess, ExpandMore, UnfoldMore } from '@mui/icons-material';
import { ToggleField } from '../shared/ToggleField';
import { Controller, FormProvider, useForm, type SubmitHandler } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { WeighInTable } from './WeighinTable';

type ContainerDetailProps = {
  data?: Container;
};

export const ContainerDetail = ({ data }: ContainerDetailProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [container, setContainer] = useState<Container>(data || location.state || {});
  const [locations, setLocations] = useState<Location[]>();
  const [options, setOptions] =
    useState<ContainerOptions['actions']['POST']['quantity_unit']['choices']>();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const params = useParams();

  useEffect(() => {
    const locationData = location.state;
    if (!locationData && !data) {
      if (!params.id) {
        return;
      }
      getContainerDetails(params.id).then(setContainer);
    }
  }, [params.id, location, data]);

  useEffect(() => {
    if (!editing) return;
    getLocations().then(setLocations);
    getContainerMetaData().then((ref) => {
      setOptions(ref.actions.POST.quantity_unit.choices);
    });
  }, [editing]);

  const {
    control,
    clearErrors,
    formState,
    setValue,
    trigger,
    resetField,
    handleSubmit,
    ...methods
  } = useForm({
    mode: 'onBlur',
    defaultValues: {
      name: container.name || '',
      location: container.location || '',
      manufacturer: container.manufacturer || '',
      product_num: container.product_num || '',
      initial_quantity: container.initial_quantity || '',
      quantity_unit: container.quantity_unit || '',
    },
  });

  const queryClient = useQueryClient();

  const onSubmit: SubmitHandler<ContainerDetailDefaults> = async (data) => {
    updateContainer(container.slug, data)
      .then(() => getContainerDetails(container.slug))
      .then(setContainer);
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: ['containerData'] });
  };

  return (
    container && (
      <FormProvider
        {...methods}
        clearErrors={clearErrors}
        setValue={setValue}
        control={control}
        trigger={trigger}
        resetField={resetField}
        handleSubmit={handleSubmit}
        formState={formState}
      >
        <Box
          onSubmit={handleSubmit(onSubmit)}
          sx={{ display: 'flex', justifyContent: 'center' }}
          component={'form'}
        >
          <Card sx={{ width: `${data ? '25dvw' : '50dvw'}`, alignSelf: 'center' }} elevation={4}>
            <CardHeader
              title={
                !editing ? (
                  container.name
                ) : (
                  <Controller
                    control={control}
                    name="name"
                    render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                      <ToggleField
                        {...field}
                        textProps={{
                          fullWidth: true,
                          defaultValue: container.name,
                          label: 'Name',
                          error: !!error,
                          helperText: error?.message,
                          onChange: (e) => {
                            onChange(e);
                            clearErrors(name);
                          },
                        }}
                        editing={editing}
                      ></ToggleField>
                    )}
                  />
                )
              }
              subheader={!editing && container.label}
              action={
                <Box>
                  {data && (
                    <IconButton
                      onClick={() => {
                        navigate(`${data.slug}`, { state: data });
                      }}
                    >
                      <UnfoldMore />
                    </IconButton>
                  )}
                  <IconButton onClick={() => setEditing((prev) => !prev)}>
                    <Edit />
                  </IconButton>
                </Box>
              }
            />
            <CardContent>
              <Stack spacing={2}>
                <Controller
                  control={control}
                  name="location"
                  render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                    <ToggleField
                      {...field}
                      editing={editing}
                      textProps={{
                        defaultValue: container.location,
                        label: 'Location',
                        error: !!error,
                        helperText: error?.message,
                        onChange: (e) => {
                          onChange(e);
                          clearErrors(name);
                        },
                      }}
                      options={
                        locations &&
                        locations?.map((l) => {
                          return {
                            key: l.id,
                            value: l.full_path,
                            text: l.full_path,
                          };
                        })
                      }
                    >
                      {container.location}
                    </ToggleField>
                  )}
                />
                <Controller
                  control={control}
                  name="manufacturer"
                  render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                    <ToggleField
                      {...field}
                      editing={editing}
                      textProps={{
                        error: !!error,
                        helperText: error?.message,
                        defaultValue: container.manufacturer,
                        label: 'Manufacturer',
                        onChange: (e) => {
                          onChange(e);
                          clearErrors(name);
                        },
                      }}
                    >
                      {container.manufacturer}
                    </ToggleField>
                  )}
                />
                <Controller
                  control={control}
                  name="product_num"
                  render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                    <ToggleField
                      {...field}
                      editing={editing}
                      textProps={{
                        error: !!error,
                        helperText: error?.message,
                        defaultValue: container.product_num,
                        label: 'Product #',
                        onChange: (e) => {
                          onChange(e);
                          clearErrors(name);
                        },
                      }}
                    >
                      {container.product_num}
                    </ToggleField>
                  )}
                />
                <Controller
                  control={control}
                  name="initial_quantity"
                  render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                    <ToggleField
                      {...field}
                      editing={editing}
                      textProps={{
                        error: !!error,
                        helperText: error?.message,
                        defaultValue: container.initial_quantity,
                        label: 'Quantity',
                        onChange: (e) => {
                          onChange(e);
                          clearErrors(name);
                        },
                        slotProps: {
                          input: {
                            endAdornment: (
                              <InputAdornment position="end">
                                <Controller
                                  control={control}
                                  name="quantity_unit"
                                  render={({
                                    field: { name, onChange, ...field },
                                    fieldState: { error },
                                  }) => (
                                    <ToggleField
                                      {...field}
                                      editing={editing}
                                      textProps={{
                                        error: !!error,
                                        helperText: error?.message,
                                        defaultValue: container.quantity_unit,
                                        variant: 'standard',
                                        label: 'Unit',
                                        onChange: (e) => {
                                          onChange(e);
                                          clearErrors(name);
                                        },
                                        slotProps: {
                                          select: {
                                            variant: 'standard',
                                          },
                                        },
                                      }}
                                      options={
                                        options &&
                                        options.map((o) => {
                                          return {
                                            key: o.value,
                                            value: o.value,
                                            text: o.display_name,
                                          };
                                        })
                                      }
                                    ></ToggleField>
                                  )}
                                />
                              </InputAdornment>
                            ),
                          },
                        },
                      }}
                    >
                      {container.quantity}
                    </ToggleField>
                  )}
                />

                <Typography>
                  <strong>Status:</strong>{' '}
                  {container.checkout_status?.action === 'out'
                    ? `Checked out by ${container.checkout_status?.user.full_name}`
                    : 'Available'}
                </Typography>
                {container.latest_reading && (
                  <Typography>
                    <strong>Current Weight:</strong> {parseFloat(container.latest_reading.weight)} g
                  </Typography>
                )}
                {container.percent_remaining && (
                  <Typography>
                    <strong>Percent Remaining:</strong> {container.percent_remaining}%
                  </Typography>
                )}
              </Stack>
            </CardContent>
            {editing && (
              <CardActions sx={{ ml: 'auto' }}>
                <Button type="submit" variant="contained">
                  Submit
                </Button>
                <Button variant="outlined" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </CardActions>
            )}
            {!data && !editing && (
              <>
                <CardActions disableSpacing>
                  <Box sx={{ display: 'flex', flexDirection: 'row', ml: 'auto' }}>
                    <Typography sx={{ alignSelf: 'center' }}>Weigh In History</Typography>
                    <IconButton onClick={() => setExpanded((prev) => !prev)}>
                      {expanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                  </Box>
                </CardActions>
                <Collapse in={expanded} timeout={'auto'} unmountOnExit sx={{ pb: 3 }}>
                  <WeighInTable slug={container.slug} />
                </Collapse>
              </>
            )}
          </Card>
        </Box>
      </FormProvider>
    )
  );
};
