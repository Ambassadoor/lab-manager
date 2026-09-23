import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  getContainerDetails,
  getContainerMetaData,
  getLocationMenu,
  updateContainer,
} from '../../api/inventory';
import { containerKeys, locationKeys, printerKeys } from '../../api/queryKeys';
import type { Container, ContainerDetailDefaults } from '../../types';
import { Close, Edit, MoreVert, Print, UnfoldMore, UploadFile } from '@mui/icons-material';
import { ToggleField } from '../shared/ToggleField';
import { DetailRow } from '../shared/DetailRow';
import { Controller, FormProvider, useForm, type SubmitHandler } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WeighInTable } from './WeighinTable';
import { NotFound } from '../shared/NotFound';
import { useAuth } from '../../context/AuthContext';
import { hasRoleAtLeast } from '../shared/roles';
import { SdsUploadDialog } from '../sds/SdsUploadDialog';
import { useContainerSdsFallback } from '../../hooks/useContainerSdsFallback';
import { decimalPatternRule } from '../shared/formRules';
import { PendingResultSnackbar } from '../shared/PendingResultSnackbar';
import { PrintResultSnackbar } from '../shared/PrintResultSnackbar';
import { printContainerLabel } from '../shared/printTemplates';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useStorageConflictConfirm } from '../shared/useStorageConflictConfirm';
import { StorageConflictWarnings } from '../shared/StorageConflictWarnings';

type ContainerDetailProps = {
  data?: Container;
  onClose?: () => void;
  // Overrides the card's default look (outlined when given `data`, as in the
  // Containers drawer) — e.g. to match elevated sibling panels on Locations.
  elevation?: number;
};

// Two related fields: side by side while editing (wrapping to one column
// when the card is too narrow, e.g. the Locations preview panel), plain
// stacked rows in view mode. Defined out here, not inside ContainerDetail,
// so re-renders don't remount the inputs and drop their focus.
const FieldPair = ({ editing, children }: { editing: boolean; children: ReactNode }) =>
  editing ? (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2 }}
    >
      {children}
    </Box>
  ) : (
    <Stack spacing={1.5}>{children}</Stack>
  );

// Matches the Dashboard's "restock soon" cutoff (see Containers.tsx filterByView)
const RESTOCK_PERCENT = 10;

const RemainingBar = ({ percent }: { percent: number }) => (
  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
    <LinearProgress
      variant="determinate"
      // Clamped — a reading above the initial weight can compute past 100%
      value={Math.min(Math.max(percent, 0), 100)}
      color={percent <= RESTOCK_PERCENT ? 'error' : 'primary'}
      sx={{ flexGrow: 1, maxWidth: 200, height: 8, borderRadius: 4 }}
    />
    <span>{percent}%</span>
  </Stack>
);

//A convertible detail/edit component for containers
export const ContainerDetail = ({ data, onClose, elevation }: ContainerDetailProps) => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const location = useLocation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Close the menu before running the action, same as Locations.tsx's row menu
  const menuAction = (fn: () => void) => () => {
    setMenuAnchor(null);
    fn();
  };
  const params = useParams();

  const seed: Container | undefined = data ?? location.state ?? undefined;

  // `seed` (drawer/preview row data, or router state) renders immediately as
  // initialData; the query stays enabled for those views too so an edit's
  // invalidation actually refetches, instead of leaving the panel showing
  // the pre-edit values.
  const slug = params.id ?? seed?.slug;
  const {
    data: container,
    isPending,
    isError,
  } = useQuery({
    queryKey: containerKeys.detail(slug ?? ''),
    queryFn: () => getContainerDetails(slug!),
    enabled: !!slug,
    initialData: seed,
  });

  const [sdsDialogOpen, setSdsDialogOpen] = useState(false);
  const sdsFallback = useContainerSdsFallback(container);

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

  // A tare weight of 0 (or less) is a placeholder, not a real container
  // weight — the backend treats it the same as missing (see
  // Container.has_estimated_usage) — so it shows as "Not set" and edits
  // from a blank field, rather than surfacing a misleading "0 g".
  const tareWeight = container?.tare_weight ? parseFloat(container.tare_weight) : 0;

  const defaultValues = {
    name: container?.name || '',
    location: String(container?.location?.id || ''),
    manufacturer: container?.manufacturer || '',
    product_num: container?.product_num || '',
    initial_quantity: container?.initial_quantity || '',
    quantity_unit: container?.quantity_unit || '',
    tare_weight: tareWeight ? String(tareWeight) : '',
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

  const printMutation = useMutation({
    mutationFn: printContainerLabel,
    // The one place here the printer's own hardware state (media, errors)
    // is guaranteed to have just changed — refetch the nav bar's status
    // indicator instead of waiting on its own poll interval.
    onSettled: () => queryClient.invalidateQueries({ queryKey: printerKeys.status() }),
  });

  const storageConflict = useStorageConflictConfirm();

  // A 404 (bad :id in the URL) lands in this query's own error state —
  // TanStack Query doesn't propagate query errors to the router's
  // ErrorBoundary on its own (no throwOnError configured) — so it has to be
  // checked here rather than relying on App.tsx's error page.
  if (isError) return <NotFound />;
  if (isPending || !container) return null;

  const doSubmit = async (formData: ContainerDetailDefaults, confirmed?: boolean) => {
    try {
      await updateContainer(
        container.slug,
        { ...formData, tare_weight: formData.tare_weight?.trim() || null },
        confirmed
      );
    } catch (e) {
      if (storageConflict.intercept(e, () => doSubmit(formData, true))) return;
      throw e;
    }
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: containerKeys.all });
    // Locations' per-location container lists live under locationKeys, and
    // an edit can move the container to a different location.
    queryClient.invalidateQueries({ queryKey: locationKeys.all });
  };

  const onSubmit: SubmitHandler<ContainerDetailDefaults> = (formData) => doSubmit(formData);

  return (
    container && (
      <>
        {/* Only the routed (:id) view, not the Containers.tsx drawer — an
            already-open drawer for an unrelated container shouldn't show a
            toast meant for whichever container ContainerForm just created.
            See pendingActionResult.ts for why this can't just be a normal
            local Snackbar here. */}
        {!onClose && <PendingResultSnackbar />}
        <PrintResultSnackbar mutation={printMutation} label="Container label" />
        <ConfirmDialog
          open={storageConflict.isOpen}
          title="Storage Conflict"
          message={
            storageConflict.warnings && (
              <StorageConflictWarnings warnings={storageConflict.warnings} />
            )
          }
          confirmLabel="Store anyway"
          confirmColor="warning"
          onCancel={storageConflict.cancel}
          onConfirm={storageConflict.confirm}
        />
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
              variant={data && elevation === undefined ? 'outlined' : 'elevation'}
              elevation={elevation ?? (data ? 0 : 4)}
            >
              {/* Header stays the same in view and edit mode (the Name field
                  lives in the form body) so the card doesn't jump on toggle */}
              <CardHeader
                title={container.name}
                subheader={
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}
                  >
                    <span>{container.label}</span>
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
                }
                action={
                  <Box>
                    {(data || canEdit) && (
                      <Tooltip title="Actions">
                        <IconButton
                          aria-haspopup="menu"
                          onClick={(e) => setMenuAnchor(e.currentTarget)}
                        >
                          <MoreVert />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Menu
                      anchorEl={menuAnchor}
                      open={menuAnchor !== null}
                      onClose={() => setMenuAnchor(null)}
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    >
                      {data && (
                        <MenuItem
                          // Absolute — this panel is also embedded on the
                          // Locations page, where a relative path breaks
                          onClick={menuAction(() =>
                            navigate(`/inventory/containers/${data.slug}`, { state: data })
                          )}
                        >
                          <ListItemIcon>
                            <UnfoldMore fontSize="small" />
                          </ListItemIcon>
                          <ListItemText>Open full page</ListItemText>
                        </MenuItem>
                      )}
                      {/* Hidden while editing — the form's own Cancel covers leaving */}
                      {canEdit && !editing && (
                        <MenuItem onClick={menuAction(() => setEditing(true))}>
                          <ListItemIcon>
                            <Edit fontSize="small" color="info" />
                          </ListItemIcon>
                          <ListItemText>Edit</ListItemText>
                        </MenuItem>
                      )}
                      {canEdit && (
                        <MenuItem onClick={menuAction(() => printMutation.mutate(container))}>
                          <ListItemIcon>
                            <Print fontSize="small" color="success" />
                          </ListItemIcon>
                          <ListItemText>Print label</ListItemText>
                        </MenuItem>
                      )}
                      {canEdit && (
                        <MenuItem onClick={menuAction(() => setSdsDialogOpen(true))}>
                          <ListItemIcon>
                            <UploadFile fontSize="small" />
                          </ListItemIcon>
                          <ListItemText>
                            {container.latest_sds ? 'Upload new SDS revision' : 'Upload SDS'}
                          </ListItemText>
                        </MenuItem>
                      )}
                    </Menu>
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
                <Stack spacing={editing ? 2 : 1.5}>
                  {editing && (
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
                          layout="row"
                        ></ToggleField>
                      )}
                    />
                  )}
                  <Controller
                    control={control}
                    name="location"
                    render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                      <ToggleField
                        {...field}
                        editing={editing}
                        layout="row"
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
                        {container.location && (
                          <Link
                            component={RouterLink}
                            to={`/inventory/locations?location=${container.location.id}`}
                          >
                            {container.location.full_path}
                          </Link>
                        )}
                      </ToggleField>
                    )}
                  />
                  <FieldPair editing={editing}>
                    <Controller
                      control={control}
                      name="manufacturer"
                      render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                        <ToggleField
                          {...field}
                          editing={editing}
                          layout="row"
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
                          layout="row"
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
                  </FieldPair>
                  <FieldPair editing={editing}>
                    <Controller
                      control={control}
                      name="initial_quantity"
                      render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                        <ToggleField
                          {...field}
                          editing={editing}
                          layout="row"
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
                                          layout="row"
                                          textProps={{
                                            error: !!error,
                                            helperText: error?.message,
                                            defaultValue: container.quantity_unit,
                                            variant: 'standard',
                                            onChange: (e) => {
                                              onChange(e);
                                              clearErrors(name);
                                            },
                                            // No label/underline — reads as part
                                            // of the outlined Quantity field
                                            // rather than a field nested in it
                                            slotProps: {
                                              input: { disableUnderline: true },
                                              select: {
                                                variant: 'standard',
                                                SelectDisplayProps: { 'aria-label': 'Unit' },
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

                    <Controller
                      control={control}
                      name="tare_weight"
                      rules={{
                        pattern: decimalPatternRule('Please input an integer or decimal'),
                        validate: (v) =>
                          !v || Number(v) > 0 || 'Must be greater than 0 (leave blank if unknown)',
                      }}
                      render={({ field: { name, onChange, ...field }, fieldState: { error } }) => (
                        <ToggleField
                          {...field}
                          editing={editing}
                          layout="row"
                          textProps={{
                            error: !!error,
                            helperText: error?.message ?? 'Weight of the empty container',
                            defaultValue: tareWeight ? String(tareWeight) : '',
                            label: 'Tare Weight',
                            onChange: (e) => {
                              onChange(e);
                              clearErrors(name);
                            },
                            slotProps: {
                              input: {
                                endAdornment: <InputAdornment position="end">g</InputAdornment>,
                              },
                            },
                          }}
                        >
                          {tareWeight ? `${tareWeight} g` : 'Not set'}
                        </ToggleField>
                      )}
                    />
                  </FieldPair>

                  {/* Read-only rows — hidden while editing so the form only
                      shows what it can actually change */}
                  {/* Preview/drawer only — the full page's weigh-in table
                      already shows the latest reading */}
                  {!editing && data && container.latest_reading && (
                    <DetailRow label="Current Weight">
                      {parseFloat(container.latest_reading.weight)} g
                    </DetailRow>
                  )}
                  {/* != null, not truthiness — 0% remaining is exactly the
                      value that most needs showing */}
                  {!editing && container.percent_remaining != null && (
                    <DetailRow label="Remaining">
                      <RemainingBar percent={Number(container.percent_remaining)} />
                    </DetailRow>
                  )}
                  {!editing && (
                    <DetailRow label="SDS">
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        {container.latest_sds ? (
                          <Button
                            size="small"
                            component={RouterLink}
                            to={`/sds/${container.latest_sds.id}`}
                          >
                            View SDS
                          </Button>
                        ) : sdsFallback.sds.length > 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            None on file for this container — see{' '}
                            {sdsFallback.sds.map((s, i) => (
                              <span key={s.id}>
                                {i > 0 && ', '}
                                <Link component={RouterLink} to={`/sds/${s.id}`}>
                                  {s.file_name}
                                </Link>
                              </span>
                            ))}{' '}
                            for this chemical.
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            None on file.
                          </Typography>
                        )}
                      </Stack>
                    </DetailRow>
                  )}
                </Stack>
              </CardContent>
              {canEdit && (
                <SdsUploadDialog
                  open={sdsDialogOpen}
                  setOpen={setSdsDialogOpen}
                  containerId={container.id}
                  chemicalId={container.chemical}
                  manufacturer={container.manufacturer}
                  productNum={container.product_num}
                />
              )}
              {editing && (
                <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
                  <Button
                    onClick={() => {
                      // Discard unsaved edits so re-entering edit mode starts clean
                      methods.reset();
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={!formState.isDirty}
                    loading={formState.isSubmitting}
                  >
                    Save
                  </Button>
                </CardActions>
              )}
              {/* Full page only — always shown rather than behind an
                  expander, since the page has the room for it */}
              {!data && !editing && (
                <>
                  <Divider />
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Weigh-in history
                    </Typography>
                    <WeighInTable slug={container.slug} />
                  </CardContent>
                </>
              )}
            </Card>
          </Box>
        </FormProvider>
      </>
    )
  );
};
