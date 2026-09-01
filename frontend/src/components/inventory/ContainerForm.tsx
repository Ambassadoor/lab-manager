import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
  FormControl,
  FormHelperText,
  InputAdornment,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
  type Path,
  type SubmitHandler,
} from 'react-hook-form';
import {
  getChemicalByCas,
  getContainerMetaData,
  getLocationMenu,
  getStorageCategories,
  submitNewContainerForm,
} from '../../api/inventory';
import { getBalanceWeight, printLabel } from '../../api/bridge';
import { containerKeys, chemicalKeys, dashboardKeys, locationKeys } from '../../api/queryKeys';
import { type ContainerFormDefaults, type CasCheck, type Location } from '../../types';
import { useNavigate } from 'react-router-dom';
import { Decimal } from 'decimal.js';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cas_is_valid } from '../shared/checkCas';
import { WeightField } from '../shared/WeightField';
import { RhfTextField } from '../shared/RhfTextField';
import { RhfDateField } from '../shared/RhfDateField';
import { ChemicalRow } from './ChemicalRow';
import { MixtureFields } from './MixtureFields';
import { requiredRule, required, decimalPatternRule } from '../shared/formRules';

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

// Every field below that can use a shared wrapper does: RhfTextField,
// RhfDateField, and RhfSelect cover the plain-text/date/select cases, and
// quantity_unit's Select is driven by the container OPTIONS metaData query
// below. The two fields still hand-written here (location's grouped
// ListSubheader options, quantity_unit living inside another field's
// InputAdornment) are intentionally excluded — see the comment on
// RhfSelect.tsx explaining why neither fits that wrapper's shape.
export const ContainerForm = () => {
  const [cas, setCas] = useState<CasCheck | undefined>();
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  const theme = useTheme();
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

  type GroupedLocations = Record<string, Location[]>;

  //Format locations to group them by room number in select drop down
  const formatLocations = useCallback((locations: Location[]) => {
    const groups: GroupedLocations = {};
    locations.forEach((l) => {
      const pattern = /(?<=\d\S*)\s/;
      const category = l.full_path.replace(pattern, '|').split('|')[0];
      if (Object.keys(groups).includes(category)) {
        if (Array.isArray(groups[category])) {
          groups[category].push(l);
        } else {
          groups[category] = [l];
        }
      } else {
        groups[category] = [l];
      }
    });
    return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
  }, []);

  //Get form select options
  const { data: chemicalStorageCategories = [] } = useQuery({
    queryKey: chemicalKeys.storageCategories(),
    queryFn: getStorageCategories,
  });

  const { data: locationMenu } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });
  const locations = useMemo(
    () => formatLocations(locationMenu ?? []),
    [locationMenu, formatLocations]
  );

  const { data: metaData, isPending: isMetaDataPending } = useQuery({
    queryKey: containerKeys.metaData(),
    queryFn: getContainerMetaData,
  });

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

  const queryClient = useQueryClient();

  const scaleMutation = useMutation({ mutationFn: getBalanceWeight });

  //Format date fields, clear session storage, invalidate stale container data and navigate to detail page
  const onSubmit: SubmitHandler<ContainerFormDefaults> = async (data) => {
    if (data.date_received && data.date_received instanceof dayjs) {
      data.date_received = data.date_received?.toISOString().split('T')[0] || null;
    }
    if (data.expiration_date && data.expiration_date instanceof dayjs) {
      data.expiration_date = data.expiration_date?.toISOString().split('T')[0] || null;
    }

    const response = await submitNewContainerForm(data);
    sessionStorage.removeItem('container_form_cache');
    queryClient.invalidateQueries({ queryKey: containerKeys.list() });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    if (data.print) {
      printLabel({
        template: 1,
        fields: { Barcode1: JSON.stringify({ id: response.label }), Text1: response.label },
        copies: 1,
      }).catch((e) => setBridgeError(e.message));
    }
    navigate(`/inventory/containers/${response.slug}`);
  };

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
                  storageCategoryOptions={chemicalStorageCategories.map((c) => ({
                    value: c.id,
                    label: c.shorthand,
                  }))}
                />
              ))}
              {formValues.multiple_cas && (
                <MixtureFields
                  control={control}
                  clearErrors={clearErrors}
                  mixtures={cas?.mixtures}
                  storageCategoryOptions={chemicalStorageCategories.map((c) => ({
                    value: c.id,
                    label: c.shorthand,
                  }))}
                />
              )}
              <Controller
                control={control}
                name="location"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <FormControl>
                    <InputLabel id="location">Location</InputLabel>
                    <Select
                      {...field}
                      value={formValues[field.name]}
                      error={!!error}
                      labelId="location"
                      label="Location"
                      onChange={(e) => {
                        field.onChange(e);
                        clearErrors(field.name);
                      }}
                      MenuProps={{
                        slotProps: {
                          paper: {
                            sx: {
                              maxHeight: 200,
                            },
                          },
                        },
                      }}
                    >
                      {Object.keys(locations).flatMap((g, i) => [
                        <ListSubheader
                          key={i}
                          sx={{
                            fontWeight: 'bold',
                            fontSize: 16,
                            backgroundColor: theme.palette.info.main,
                          }}
                        >
                          {g}
                        </ListSubheader>,
                        locations[g].map((l) => (
                          <MenuItem key={l.id} value={l.id}>
                            {l.full_path}
                          </MenuItem>
                        )),
                      ])}
                    </Select>
                    {error && <FormHelperText error>{error.message}</FormHelperText>}
                  </FormControl>
                )}
              />
              <RhfTextField
                control={control}
                name="manufacturer"
                label="Manufacturer"
                rules={{ required: requiredRule }}
                clearErrors={clearErrors}
              />
              <Stack spacing={2}>
                <Controller
                  control={control}
                  name="initial_quantity"
                  rules={{
                    required: {
                      value: true,
                      message: 'Required',
                    },
                  }}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      label="Initial Quantity"
                      {...field}
                      error={!!error || !!errors.quantity_unit}
                      onChange={(e) => {
                        field.onChange(e);
                        clearErrors(field.name);
                      }}
                      helperText={
                        (error?.message || errors.quantity_unit?.message) &&
                        [error?.message, errors.quantity_unit?.message].join('. ')
                      }
                      slotProps={{
                        input: {
                          endAdornment: (
                            <Controller
                              control={control}
                              name="quantity_unit"
                              rules={{
                                required: {
                                  value: true,
                                  message: 'Please select a unit',
                                },
                              }}
                              render={({ field, fieldState: { error } }) => (
                                <InputAdornment position="end">
                                  <Select
                                    {...field}
                                    error={!!error}
                                    label="Unit"
                                    value={formValues?.quantity_unit}
                                    autoWidth
                                    variant="standard"
                                    disabled={isMetaDataPending}
                                    MenuProps={{
                                      slotProps: {
                                        paper: {
                                          sx: {
                                            maxHeight: 200,
                                          },
                                        },
                                      },
                                    }}
                                  >
                                    {metaData?.actions?.POST.quantity_unit.choices.map((c, i) => (
                                      <MenuItem key={i} value={c.value}>
                                        {c.display_name}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </InputAdornment>
                              )}
                            />
                          ),
                        },
                      }}
                    />
                  )}
                />
              </Stack>
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
              <Stack direction={'row'} spacing={2} sx={{ justifyContent: 'right' }}>
                <Button variant="contained" type="submit" loading={isSubmitting || isValidating}>
                  Submit
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    sessionStorage.removeItem('container_form_cache');
                    reset();
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
