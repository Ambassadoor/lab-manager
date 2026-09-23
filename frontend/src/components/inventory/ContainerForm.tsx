import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Container,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
  type Path,
  type SubmitHandler,
} from 'react-hook-form';
import { getChemicalByCas, submitNewContainerForm } from '../../api/inventory';
import { getBalanceWeight } from '../../api/bridge';
import { createSds, type PendingSdsSelection } from '../../api/sds';
import { containerKeys, dashboardKeys, printerKeys } from '../../api/queryKeys';
import { setPendingActionResult, type PendingActionResult } from '../shared/pendingActionResult';
import { printContainerLabel } from '../shared/printTemplates';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useStorageConflictConfirm } from '../shared/useStorageConflictConfirm';
import { StorageConflictWarnings } from '../shared/StorageConflictWarnings';
import { type ContainerFormDefaults, type CasCheck } from '../../types';
import { useNavigate } from 'react-router-dom';
import { Decimal } from 'decimal.js';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cas_is_valid } from '../shared/checkCas';
import { WeightField } from '../shared/WeightField';
import { RhfTextField } from '../shared/RhfTextField';
import { RhfDateField } from '../shared/RhfDateField';
import { SdsUploadDialog } from '../sds/SdsUploadDialog';
import { ChemicalRow } from './ChemicalRow';
import { MixtureFields } from './MixtureFields';
import { requiredRule, required, decimalPatternRule } from '../shared/formRules';
import { LocationSelect } from '../shared/LocationSelect';
import { QuantityUnitField } from '../shared/QuantityUnitField';

// Converts a quantity from currentUnit to defaultUnit's unit family (mass or volume).
const convertUnits = (defaultUnit: string, currentUnit: string, quantity: string | number) => {
  const massUnits = ['mg', 'g', 'kg'];
  const volumeUnits = ['mL', 'L'];
  const q = new Decimal(parseFloat(String(quantity)));
  if (defaultUnit.includes('g')) {
    const power = massUnits.indexOf(currentUnit) - massUnits.indexOf(defaultUnit);
    const result = q.times(1000 ** power).toNumber();
    return result;
  } else if (defaultUnit.includes('L')) {
    const power = volumeUnits.indexOf(currentUnit) - volumeUnits.indexOf(defaultUnit);
    const result = q.times(1000 ** power).toNumber();
    return result;
  }
  return parseFloat(String(quantity));
};

// Every field below uses a shared wrapper where one fits: RhfTextField,
// RhfDateField, and RhfSelect for plain text/date/select, LocationSelect for
// the grouped location picker, and QuantityUnitField for quantity + unit.
export const ContainerForm = () => {
  const [cas, setCas] = useState<CasCheck | undefined>();
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  // Kept outside RHF (unlike the rest of the form): a File can't survive
  // JSON.stringify, which the session-storage form-memory effect below
  // does to every RHF field on every change, and this shouldn't be part of
  // that "resume where I left off on reload" cache anyway. The chemical/
  // container this belongs to doesn't exist until submit, so
  // SdsUploadDialog runs in its "deferred" mode here (see its own comment) —
  // it stages a selection via onSelect instead of attaching immediately, and
  // the actual createSds call happens in onSubmit once the real container
  // id comes back.
  const [sdsDialogOpen, setSdsDialogOpen] = useState(false);
  const [pendingSds, setPendingSds] = useState<PendingSdsSelection | null>(null);
  const [pendingSdsLabel, setPendingSdsLabel] = useState('');

  const navigate = useNavigate();

  const defaultValues = {
    print: true,
    name: '',
    multiple_cas: false,
    mixture_name: '',
    mixture_storage_category: '',
    mixture_molecular_weight: '',
    chemicals: [
      {
        cas: '',
        name: '',
        molecular_weight: '',
        storage_category: '',
      },
    ],
    location: '',
    manufacturer: '',
    initial_quantity: '',
    quantity_unit: 'g',
    product_num: '',
    date_received: null,
    density: '',
    expiration_date: null,
    initial_weight: '',
    tare_weight: '',
    mixture_id: '',
  };

  //Retrieve cached values from sessionStorage
  const getContainerCachedValues = () => {
    const cached = sessionStorage.getItem('container_form_cache');
    return cached ? JSON.parse(cached) : defaultValues;
  };

  //Set up rhf form
  const formMethods = useForm<ContainerFormDefaults>({
    mode: 'onBlur',
    defaultValues: getContainerCachedValues(),
  });
  const {
    control,
    clearErrors,
    formState: { errors, isSubmitting, isValidating },
    setValue,
    trigger,
    handleSubmit,
    reset,
  } = formMethods;
  //Allows for dynamically added cas/chemical fields
  const { fields, append, remove } = useFieldArray({
    control: control,
    name: 'chemicals',
    keyName: 'rhfId',
  });

  //Watches the form for changes
  const formValues = useWatch({ control });

  //Values from all cas fields
  const allCas = useWatch({
    control,
    name: fields.map((_, index) => `chemicals.${index}.cas` as Path<ContainerFormDefaults>),
  }) as string[];

  //Store field values in session storage for form memory on reloads
  useEffect(() => {
    sessionStorage.setItem('container_form_cache', JSON.stringify(formValues));
  }, [formValues]);

  const casRef = useRef(cas);

  //Check db for input cas nums and update fields with info if already in system
  useEffect(() => {
    if (!allCas) return;
    const validCasNum: { index: number; cas: string }[] = [];
    let already_processed = false;
    allCas.forEach((c, i) => {
      if (!errors.chemicals?.[i]?.cas && c && cas_is_valid(c)) {
        validCasNum.push({ index: i, cas: c });
      }
    });
    if (
      casRef.current &&
      validCasNum.every((c) => casRef.current?.chemicals.map((chem) => chem.cas).includes(c.cas)) &&
      casRef.current.chemicals.every((chem) => {
        if (!chem.cas) return false;
        else return validCasNum.map((n) => n.cas).includes(chem.cas);
      })
    )
      already_processed = true;
    if (already_processed) return;
    const casString = validCasNum?.map((v) => v.cas).join(',');
    if (casString.length > 0)
      getChemicalByCas(casString).then((res) => {
        res.chemicals.forEach((c) => {
          const name = validCasNum.find((o) => {
            return o.cas === c.cas;
          });
          if (name?.index !== undefined) {
            setValue(`chemicals.${name.index}.name`, c.name);
            if (c.molecular_weight)
              setValue(`chemicals.${name.index}.molecular_weight`, c.molecular_weight);
            if (c.storage_category)
              setValue(`chemicals.${name.index}.storage_category`, c.storage_category.id);
          }
        });
        setCas(res);
        casRef.current = res;
      });
  }, [errors.chemicals, setValue, allCas]);

  //Calculate and populate the tare weight field using previously input fields
  useEffect(() => {
    let initial_quantity = formValues.initial_quantity,
      initial_weight = formValues.initial_weight,
      density = formValues.density;
    const quantity_unit = formValues.quantity_unit;
    if (
      !initial_quantity ||
      !quantity_unit ||
      !initial_weight ||
      !(initial_quantity = parseFloat(String(initial_quantity))) ||
      !(initial_weight = parseFloat(String(initial_weight)))
    )
      return;
    if (quantity_unit.includes('g')) {
      initial_quantity = convertUnits('g', quantity_unit, initial_quantity);
      const iw = new Decimal(initial_weight);
      const iq = new Decimal(initial_quantity);
      const result = iw.minus(iq);
      clearErrors('tare_weight');
      setValue('tare_weight', result.toNumber());
      trigger('tare_weight');
    } else if (quantity_unit.includes('L')) {
      initial_quantity = convertUnits('mL', quantity_unit, initial_quantity);
      const iw = new Decimal(initial_weight);
      const iq = new Decimal(initial_quantity);
      if (!density || !(density = parseFloat(String(density)))) {
        return;
      } else {
        const d = new Decimal(density);
        const result = iw.minus(iq.times(d));
        clearErrors('tare_weight');
        setValue('tare_weight', result.toNumber());
        trigger('tare_weight');
      }
    }
  }, [
    formValues.initial_quantity,
    formValues.initial_weight,
    formValues.quantity_unit,
    formValues.density,
    clearErrors,
    trigger,
    setValue,
  ]);

  //Set fields values for chosen mixture if present
  useEffect(() => {
    if (!formValues.mixture_id) return;
    const chosenMixture = cas?.mixtures.find((mix) => mix.id === Number(formValues.mixture_id));
    setValue('mixture_name', chosenMixture?.name || '');
    setValue('mixture_molecular_weight', chosenMixture?.molecular_weight || '');
    setValue('mixture_storage_category', chosenMixture?.storage_category.id || '');
  }, [formValues.mixture_id, setValue, cas]);

  // The real chemical id to scope "attach an existing SDS" suggestions by —
  // only resolvable once we actually know one: either the typed CAS matched
  // an existing chemical (nothing to suggest for a brand-new one — it can't
  // have a prior SDS), or an existing mixture was picked via mixture_id (a
  // new mixture, same reasoning, has nothing to suggest either).
  const resolvedChemicalId = useMemo(() => {
    if (formValues.multiple_cas) return formValues.mixture_id || undefined;
    const typedCas = formValues.chemicals?.[0]?.cas;
    return cas?.chemicals.find((c) => c.cas === typedCas)?.id;
  }, [formValues.multiple_cas, formValues.mixture_id, formValues.chemicals, cas]);

  const queryClient = useQueryClient();

  const scaleMutation = useMutation({ mutationFn: getBalanceWeight });

  const printMutation = useMutation({
    mutationFn: printContainerLabel,
    // The one place in this form where the printer's own hardware state
    // (media, errors) is guaranteed to have just changed — refetch the nav
    // bar's status indicator instead of waiting on its own poll interval.
    onSettled: () => queryClient.invalidateQueries({ queryKey: printerKeys.status() }),
  });

  const storageConflict = useStorageConflictConfirm();

  //Format date fields, clear session storage, invalidate stale container data and navigate to detail page
  const doSubmit = async (data: ContainerFormDefaults, confirmed?: boolean) => {
    if (data.date_received && data.date_received instanceof dayjs) {
      data.date_received = data.date_received?.toISOString().split('T')[0] || null;
    }
    if (data.expiration_date && data.expiration_date instanceof dayjs) {
      data.expiration_date = data.expiration_date?.toISOString().split('T')[0] || null;
    }

    let response;
    try {
      response = await submitNewContainerForm(data, confirmed);
    } catch (e) {
      // Storage-conflict 409s are handled here (show the warnings, offer
      // to proceed anyway) rather than as a normal submit failure — any
      // other error just propagates like it did before this existed.
      if (storageConflict.intercept(e, () => doSubmit(data, true))) return;
      throw e;
    }
    sessionStorage.removeItem('container_form_cache');
    queryClient.invalidateQueries({ queryKey: containerKeys.list() });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

    // Both of these used to be fire-and-forget (print) or awaited but only
    // shown via a Snackbar in *this* component (SDS) — but navigate() below
    // unmounts this form immediately after, before either async result
    // could ever actually be seen. Both are awaited now and their outcome
    // stashed via setPendingActionResult instead, for the destination page
    // to show once it lands (see that module's comment for why).
    const results: PendingActionResult[] = [];

    if (data.print) {
      try {
        await printMutation.mutateAsync(response);
        results.push({ severity: 'success', message: 'Container label sent to printer.' });
      } catch (e) {
        results.push({
          severity: 'error',
          message: `Container label failed to print: ${e instanceof Error ? e.message : 'Unknown error'}`,
        });
      }
    }
    if (pendingSds) {
      try {
        await createSds({ container: response.id, ...pendingSds });
      } catch (e) {
        results.push({
          severity: 'error',
          message: e instanceof Error ? e.message : 'Failed to upload SDS.',
        });
      }
    }
    // Combined into one message rather than picking a winner — print and
    // SDS failing independently in the same submit is rare, but dropping
    // whichever one didn't "win" would hide a real problem either way.
    if (results.length > 0) {
      setPendingActionResult({
        severity: results.some((r) => r.severity === 'error') ? 'error' : 'success',
        message: results.map((r) => r.message).join(' '),
      });
    }

    navigate(`/inventory/containers/${response.slug}`);
  };

  const onSubmit: SubmitHandler<ContainerFormDefaults> = (data) => doSubmit(data);

  // Chemical/mixture sub-forms are already split out into ChemicalRow and
  // MixtureFields below; the remaining "wrapper components for Controllers"
  // half of this is the same completed work noted above ContainerForm's
  // definition.
  return (
    <Container
      sx={{
        padding: 4,
      }}
    >
      <Snackbar
        open={!!bridgeError}
        onClose={() => setBridgeError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={6000}
      >
        <Alert
          onClose={() => setBridgeError(null)}
          severity="error"
          variant="filled"
          sx={{ width: '100%' }}
        >
          {bridgeError}
        </Alert>
      </Snackbar>
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
      <FormProvider {...formMethods}>
        <Card
          sx={{
            display: 'flex',
            maxWidth: '50vw',
            flexDirection: 'column',
            alignSelf: 'center',
            margin: 'auto',
            padding: 4,
          }}
          elevation={6}
        >
          <Box component={'form'} onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={2}>
              <Stack direction={'row'} sx={{ justifyContent: 'space-between' }}>
                <Typography component={'h1'} variant={'h4'}>
                  Add New Container
                </Typography>
                <Controller
                  control={control}
                  name="print"
                  render={({ field: { name, onChange, ...field } }) => (
                    <Stack direction={'row'}>
                      <Typography sx={{ alignSelf: 'center' }}>Print Label?</Typography>
                      <Checkbox
                        {...field}
                        onChange={(e) => {
                          onChange(e);
                          clearErrors(name);
                        }}
                        checked={!!field.value}
                      />
                    </Stack>
                  )}
                />
              </Stack>
              <RhfTextField
                control={control}
                name="name"
                label="Product Name"
                rules={{ required: requiredRule }}
                clearErrors={clearErrors}
              />
              <Controller
                control={control}
                name="multiple_cas"
                render={({ field: { value, onChange, ...field } }) => (
                  <Stack direction={'row'}>
                    <Checkbox
                      {...field}
                      checked={!!value}
                      onChange={(e) => onChange(e.target.checked)}
                    />
                    <Typography sx={{ alignSelf: 'center' }}>Multiple CAS numbers?</Typography>
                  </Stack>
                )}
              />
              {fields.map((item, index) => (
                <ChemicalRow
                  key={item.rhfId}
                  control={control}
                  index={index}
                  clearErrors={clearErrors}
                  multipleCas={!!formValues.multiple_cas}
                  showRemove={index > 0}
                  isLast={index + 1 === fields.length}
                  onAdd={() =>
                    append({ cas: '', name: '', molecular_weight: '', storage_category: '' })
                  }
                  onRemove={() => remove(index)}
                  otherCasValues={(formValues.chemicals ?? []).map((c, i) =>
                    i !== index ? c?.cas : undefined
                  )}
                />
              ))}
              {formValues.multiple_cas && (
                <MixtureFields
                  control={control}
                  clearErrors={clearErrors}
                  mixtures={cas?.mixtures}
                />
              )}
              <LocationSelect
                control={control}
                name="location"
                label="Location"
                rules={{ required: requiredRule }}
                clearErrors={clearErrors}
              />
              <RhfTextField
                control={control}
                name="manufacturer"
                label="Manufacturer"
                rules={{ required: requiredRule }}
                clearErrors={clearErrors}
              />
              <QuantityUnitField
                control={control}
                quantityName="initial_quantity"
                unitName="quantity_unit"
                label="Initial Quantity"
                quantityRules={{ required: requiredRule }}
                unitRules={{ required: required('Please select a unit') }}
                clearErrors={clearErrors}
              />
              <RhfTextField
                control={control}
                name="product_num"
                label="Product #"
                rules={{ required: requiredRule }}
                clearErrors={clearErrors}
              />
              <RhfDateField
                control={control}
                name="date_received"
                label="Date Received"
                disableFuture
                rules={{ required: requiredRule }}
              />
              <RhfTextField
                control={control}
                name="density"
                label="Density/Specific Gravity"
                rules={{ pattern: decimalPatternRule('Please input a integer or decimal') }}
                clearErrors={clearErrors}
              />
              <RhfDateField control={control} name="expiration_date" label="Expiration Date" />
              <Stack direction={'row'} spacing={2}>
                <WeightField
                  control={control}
                  name="initial_weight"
                  label="Initial Weight"
                  setValue={setValue}
                  clearErrors={clearErrors}
                  onError={setBridgeError}
                  scaleMutation={scaleMutation}
                />
                <RhfTextField
                  control={control}
                  name="tare_weight"
                  label="Tare Weight"
                  fullWidth
                  clearErrors={clearErrors}
                  endAdornment="g"
                  rules={{
                    required: required('Required, estimate if needed'),
                    pattern: decimalPatternRule('Please input a integer or decimal'),
                    min: {
                      value: 0,
                      message: 'Tare weight cannot be negative',
                    },
                    validate: {
                      match: async (value) => {
                        if (!formValues.quantity_unit || !formValues.initial_quantity) return;
                        if (formValues.quantity_unit?.includes('g')) {
                          const v = new Decimal(parseFloat(String(value)));
                          const iw = new Decimal(parseFloat(String(formValues.initial_weight)));
                          const iq = new Decimal(
                            convertUnits('g', formValues.quantity_unit, formValues.initial_quantity)
                          );

                          if (!iw.minus(iq).equals(v)) {
                            return 'Tare weight should equal the difference between the Initial Weight and the Initial Quantity';
                          }
                        } else {
                          const iw = new Decimal(parseFloat(String(formValues.initial_weight)));
                          const iq = new Decimal(
                            convertUnits(
                              'mL',
                              formValues.quantity_unit,
                              formValues.initial_quantity
                            )
                          );
                          const v = new Decimal(value);
                          const d = new Decimal(parseFloat(String(formValues.density)));
                          if (!iw.minus(iq.times(d)).equals(v)) {
                            return 'Tare weight should equal Initial Weight - Initial Quantity * Density';
                          }
                        }
                      },
                    },
                  }}
                />
              </Stack>
              <Divider />
              <Stack spacing={1}>
                <Typography variant="subtitle1">Attach SDS (optional)</Typography>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Button variant="outlined" onClick={() => setSdsDialogOpen(true)}>
                    {pendingSds ? 'Change SDS' : 'Attach SDS'}
                  </Button>
                  {pendingSds && (
                    <Chip
                      label={pendingSdsLabel}
                      onDelete={() => {
                        setPendingSds(null);
                        setPendingSdsLabel('');
                      }}
                    />
                  )}
                </Stack>
                <SdsUploadDialog
                  open={sdsDialogOpen}
                  setOpen={setSdsDialogOpen}
                  chemicalId={resolvedChemicalId}
                  manufacturer={formValues.manufacturer}
                  productNum={formValues.product_num}
                  onSelect={(selection, label) => {
                    setPendingSds(selection);
                    setPendingSdsLabel(label);
                  }}
                />
              </Stack>
              <Divider />
              <Stack direction={'row'} spacing={2} sx={{ justifyContent: 'right' }}>
                <Button variant="contained" type="submit" loading={isSubmitting || isValidating}>
                  Submit
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    sessionStorage.removeItem('container_form_cache');
                    reset();
                    setPendingSds(null);
                    setPendingSdsLabel('');
                    navigate('/');
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Card>
      </FormProvider>
    </Container>
  );
};
