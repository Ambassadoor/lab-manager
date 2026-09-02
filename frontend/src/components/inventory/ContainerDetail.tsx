import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  getContainerDetails,
  getContainerMetaData,
  getLocationMenu,
  updateContainer,
} from '../../api/inventory';
import { containerKeys, locationKeys } from '../../api/queryKeys';
import type { Container, ContainerDetailDefaults } from '../../types';
import { Close, Edit, ExpandLess, ExpandMore, UnfoldMore } from '@mui/icons-material';
import { ToggleField } from '../shared/ToggleField';
import { Controller, FormProvider, useForm, type SubmitHandler } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WeighInTable } from './WeighinTable';
import { NotFound } from '../shared/NotFound';
import { useAuth } from '../../context/AuthContext';
import { hasRoleAtLeast } from '../shared/roles';

type ContainerDetailProps = {
  data?: Container;
  onClose?: () => void;
};

//A convertible detail/edit component for containers
export const ContainerDetail = ({ data, onClose }: ContainerDetailProps) => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const location = useLocation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const params = useParams();

  const seed: Container | undefined = data ?? location.state ?? undefined;

  // enabled only for the routed (:id) view — the drawer/expand views already have full data via `seed`
  const {
    data: container,
    isPending,
    isError,
  } = useQuery({
    queryKey: containerKeys.detail(params.id ?? seed?.slug ?? ''),
    queryFn: () => getContainerDetails(params.id!),
    enabled: !!params.id,
    initialData: seed,
  });

  //Get select field options
  const { data: locations } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
    enabled: editing,
  });

  const { data: metaData } = useQuery({
    queryKey: containerKeys.metaData(),
    queryFn: getContainerMetaData,
    enabled: editing,
  });
  const options = metaData?.actions.POST.quantity_unit.choices;

  const defaultValues = {
    name: container?.name || '',
    location: String(container?.location?.id || ''),
    manufacturer: container?.manufacturer || '',
    product_num: container?.product_num || '',
    initial_quantity: container?.initial_quantity || '',
    quantity_unit: container?.quantity_unit || '',
  };

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
    values: defaultValues,
    defaultValues: defaultValues,
  });

  const queryClient = useQueryClient();

  // A 404 (bad :id in the URL) lands in this query's own error state —
  // TanStack Query doesn't propagate query errors to the router's
  // ErrorBoundary on its own (no throwOnError configured) — so it has to be
  // checked here rather than relying on App.tsx's error page.
  if (isError) return <NotFound />;
  if (isPending || !container) return null;

  const onSubmit: SubmitHandler<ContainerDetailDefaults> = async (formData) => {
    await updateContainer(container.slug, formData);
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: containerKeys.all });
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
          <Card
            sx={{ width: `${data ? '25dvw' : '50dvw'}`, alignSelf: 'center' }}
            variant={data ? 'outlined' : 'elevation'}
            elevation={data ? 0 : 4}
          >
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
                  {canEdit && (
                    <IconButton onClick={() => setEditing((prev) => !prev)}>
                      <Edit />
                    </IconButton>
                  )}
                  {onClose && (
                    <Tooltip title="Close">
                      <IconButton onClick={onClose}>
                        <Close />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              }
            />
            <Divider />
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
                        defaultValue: container.location?.id,
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
                            value: l.id,
                            text: l.full_path,
                          };
                        })
                      }
                    >
                      {container.location?.full_path}
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

                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography>
                    <strong>Status:</strong>
                  </Typography>
                  <Chip
                    size="small"
                    color={container.checkout_status?.action === 'out' ? 'warning' : 'success'}
                    label={
                      container.checkout_status?.action === 'out'
                        ? `Checked out by ${container.checkout_status?.user.full_name}`
                        : 'Available'
                    }
                  />
                </Stack>
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
                <Button type="submit" variant="contained" loading={formState.isSubmitting}>
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
