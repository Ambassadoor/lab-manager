import { Add, ArrowDropDown, Remove } from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputAdornment,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  getLocations,
  getStorageCategories,
  submitNewContainerForm,
} from '../../api/inventory';
import { DateField } from '@mui/x-date-pickers';
import {
  type ContainerFormDefaults,
  type CasCheck,
  type Location,
  type StorageCategory,
  type ContainerOptions,
} from '../../types';
import { useNavigate } from 'react-router-dom';
import { Decimal } from 'decimal.js';
import dayjs from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';

export const ContainerForm = () => {
  const [chemicalStorageCategories, setChemicalStorageCategories] = useState<
    StorageCategory[] | []
  >([]);
  const [locations, setLocations] = useState<GroupedLocations>({});
  const [metaData, setMetaData] = useState<ContainerOptions | undefined>();
  const [cas, setCas] = useState<CasCheck | undefined>();

  const theme = useTheme();
  const navigate = useNavigate();

  const defaultValues = {
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

  const getContainerCachedValues = () => {
    const cached = sessionStorage.getItem('container_form_cache');
    return cached ? JSON.parse(cached) : defaultValues;
  };

  const {
    control,
    clearErrors,
    formState: { errors, dirtyFields, touchedFields, ...rest },
    setValue,
    trigger,
    resetField,
    handleSubmit,
    ...methods
  } = useForm<ContainerFormDefaults>({
    mode: 'onBlur',
    defaultValues: getContainerCachedValues(),
  });
  const { fields, append, remove } = useFieldArray({
    control: control,
    name: 'chemicals',
    keyName: 'rhfId',
  });

  const formValues = useWatch({ control });

  const allCas = useWatch({
    control,
    name: fields.map((_, index) => `chemicals.${index}.cas` as Path<ContainerFormDefaults>),
  }) as string[];

  useEffect(() => {
    sessionStorage.setItem('container_form_cache', JSON.stringify(formValues));
  }, [formValues]);

  type GroupedLocations = Record<string, Location[]>;

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

  useEffect(() => {
    getStorageCategories().then(setChemicalStorageCategories);
    getLocations().then(formatLocations).then(setLocations);
    getContainerMetaData().then(setMetaData);
  }, [formatLocations]);

  const cas_is_valid = (value: string) => {
    if (!value) return false;
    const parts = value.split('-');
    const check_digit = parts[2];
    const formatted = parts.join('').split('').reverse();
    let sum = 0;
    formatted.forEach((d, i) => {
      sum += i * Number(d);
    });
    if (sum % 10 !== Number(check_digit)) {
      return false;
    } else return true;
  };
  const casRef = useRef(cas);

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

  useEffect(() => {
    if (!formValues.mixture_id) return;
    const chosenMixture = cas?.mixtures.find((mix) => mix.id === Number(formValues.mixture_id));
    setValue('mixture_name', chosenMixture?.name || '');
    setValue('mixture_molecular_weight', chosenMixture?.molecular_weight || '');
    setValue('mixture_storage_category', chosenMixture?.storage_category.id || '');
  }, [formValues.mixture_id, setValue, cas]);

  const queryClient = useQueryClient();

  const onSubmit: SubmitHandler<ContainerFormDefaults> = async (data) => {
    if (data.date_received) {
      data.date_received = data.date_received?.split('T')[0] || null;
    }
    if (data.expiration_date) {
      data.expiration_date = data.expiration_date?.split('T')[0] || null;
    }

    const response = await submitNewContainerForm(data);
    sessionStorage.removeItem('container_form_cache');
    queryClient.invalidateQueries({ queryKey: ['containerData']})
    navigate(`/inventory/containers/${response.id}`);
  };

  return (
    <Container
      sx={{
        padding: 4,
      }}
    >
      <FormProvider
        {...methods}
        clearErrors={clearErrors}
        setValue={setValue}
        control={control}
        trigger={trigger}
        resetField={resetField}
        handleSubmit={handleSubmit}
        formState={{
          errors: errors,
          touchedFields: touchedFields,
          dirtyFields: dirtyFields,
          ...rest,
        }}
      >
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
              <Typography component={'h1'} variant={'h4'}>
                Add New Container
              </Typography>
              <Controller
                control={control}
                name="name"
                render={({ field: { name, onChange, ...field } }) => (
                  <TextField
                    {...field}
                    label="Product Name"
                    error={!!errors.name}
                    helperText={errors.name?.message || ''}
                    onChange={(e) => {
                      onChange(e);
                      clearErrors(name);
                    }}
                  />
                )}
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
              />
              <Controller
                control={control}
                name="multiple_cas"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        {...field}
                        checked={!!value}
                        onChange={(e) => onChange(e.target.checked)}
                      />
                    }
                    label="Multiple CAS Numbers?"
                  />
                )}
              />
              {fields.map((item, index) => (
                <Stack spacing={2} key={item.rhfId}>
                  <Controller
                    control={control}
                    name={`chemicals.${index}.cas`}
                    rules={{
                      pattern: {
                        value: /^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$/,
                        message: 'Invalid CAS format',
                      },
                      required: {
                        value: true,
                        message: 'Required',
                      },
                      validate: {
                        check_digit: (value) => {
                          if (!cas_is_valid(value)) return 'Invalid CAS number';
                        },
                        duplicate: async (value) => {
                          if (!formValues?.chemicals) return true;
                          const casNums = formValues.chemicals.map((c, i) => {
                            if (i !== index) {
                              return c.cas;
                            }
                          });
                          if (casNums.includes(value)) return 'Duplicate CAS #';
                        },
                      },
                    }}
                    render={({ field, fieldState: { error } }) => (
                      <TextField
                        {...field}
                        label="CAS #"
                        error={!!error}
                        helperText={error ? error.message : ''}
                        fullWidth
                        onChange={(e) => {
                          field.onChange(e);
                          clearErrors(`chemicals.${index}.cas`);
                        }}
                        slotProps={{
                          input: {
                            endAdornment: formValues.multiple_cas && (
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
                                {index + 1 === fields.length && (
                                  <IconButton
                                    onClick={() => {
                                      append({
                                        cas: '',
                                        name: '',
                                        molecular_weight: '',
                                        storage_category: 0,
                                      });
                                    }}
                                  >
                                    <Add />
                                  </IconButton>
                                )}
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                    )}
                  />
                  {formValues?.chemicals?.[index]?.cas && (
                    <Box>
                      <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ArrowDropDown />}>
                          <Typography
                            component={'span'}
                          >{`Chemical Info for ${formValues?.chemicals?.[index].cas}`}</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Stack spacing={2}>
                            <Controller
                              name={`chemicals.${index}.name`}
                              control={control}
                              rules={{
                                required: {
                                  value: true,
                                  message: 'Required',
                                },
                              }}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  error={!!errors?.chemicals?.[index]?.name}
                                  helperText={
                                    errors?.chemicals?.[index]?.name &&
                                    errors?.chemicals?.[index]?.name.message
                                  }
                                  onChange={(e) => {
                                    field.onChange(e);
                                    clearErrors(field.name);
                                  }}
                                  label={`Name`}
                                />
                              )}
                            />
                            <Controller
                              name={`chemicals.${index}.molecular_weight`}
                              control={control}
                              rules={{
                                pattern: {
                                  value: /^\d+(\.\d+)?$/,
                                  message: 'Please input integer or decimal value.',
                                },
                              }}
                              render={({ field, fieldState: { error } }) => (
                                <TextField
                                  {...field}
                                  label={'Molecular Weight'}
                                  error={!!error}
                                  helperText={error && error.message}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    clearErrors(field.name);
                                  }}
                                  slotProps={{
                                    input: {
                                      endAdornment: (
                                        <InputAdornment position="end">g/mol</InputAdornment>
                                      ),
                                    },
                                  }}
                                />
                              )}
                            />
                            <Controller
                              name={`chemicals.${index}.storage_category`}
                              control={control}
                              render={({ field }) => (
                                <FormControl>
                                  <InputLabel id="sc_label">Storage Category</InputLabel>
                                  <Select
                                    {...field}
                                    labelId="sc_label"
                                    label="Storage Category"
                                    value={formValues?.chemicals?.[index].storage_category}
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
                                    {chemicalStorageCategories.map((c) => (
                                      <MenuItem key={c.id} value={c.id}>
                                        {c.shorthand}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              )}
                            />
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    </Box>
                  )}
                </Stack>
              ))}
              {formValues.multiple_cas && (
                <>
                  {cas?.mixtures && cas?.mixtures.length > 0 && (
                    <Controller
                      control={control}
                      name={`mixture_id`}
                      rules={{
                        required: {
                          value: true,
                          message: 'Select an existing mixture, or create a new one',
                        },
                      }}
                      render={({ field, fieldState: { error } }) => (
                        <FormControl>
                          <InputLabel id="mixture_label">Select a Mixture</InputLabel>
                          <Select
                            {...field}
                            labelId="mixture_label"
                            label="Select a Mixture"
                            value={formValues?.mixture_id}
                            error={!!error}
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
                            <MenuItem key={-1} value={-1}>
                              Create New Mixture
                            </MenuItem>
                            {cas.mixtures.map((mix) => (
                              <MenuItem key={mix.id} value={mix.id}>
                                {mix.name}
                              </MenuItem>
                            ))}
                          </Select>
                          {error && <FormHelperText error>{error.message}</FormHelperText>}
                        </FormControl>
                      )}
                    />
                  )}
                  <Box>
                    <Stack spacing={2} sx={{ ml: 2 }}>
                      <Controller
                        control={control}
                        name={`mixture_name`}
                        render={({ field: { onChange, name, ...field } }) => (
                          <TextField
                            {...field}
                            label="Mixture Name"
                            fullWidth
                            error={!!errors.mixture_name}
                            helperText={
                              errors.mixture_name?.message ? errors.mixture_name.message : ''
                            }
                            onChange={(e) => {
                              onChange(e);
                              clearErrors(name);
                            }}
                          />
                        )}
                        rules={{
                          required: {
                            value: true,
                            message: 'Required',
                          },
                        }}
                      />
                      <Controller
                        control={control}
                        name={'mixture_storage_category'}
                        rules={{
                          required: {
                            value: true,
                            message: 'Required',
                          },
                        }}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl>
                            <InputLabel id="sc_label">Storage Category</InputLabel>
                            <Select
                              {...field}
                              labelId="sc_label"
                              label="Storage Category"
                              value={formValues?.mixture_storage_category}
                              error={!!error}
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
                              {chemicalStorageCategories.map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {c.shorthand}
                                </MenuItem>
                              ))}
                            </Select>
                            {error && <FormHelperText error>{error?.message}</FormHelperText>}
                          </FormControl>
                        )}
                      />
                      <Controller
                        control={control}
                        name={'mixture_molecular_weight'}
                        rules={{
                          pattern: {
                            value: /^\d+(\.\d+)?$/,
                            message: 'Please input integer or decimal value.',
                          },
                        }}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            error={!!errors.mixture_molecular_weight}
                            label="Molecular Weight"
                            onChange={(e) => {
                              field.onChange(e);
                              clearErrors('mixture_molecular_weight');
                            }}
                            helperText={
                              errors.mixture_molecular_weight &&
                              errors.mixture_molecular_weight.message
                            }
                            slotProps={{
                              input: {
                                endAdornment: <InputAdornment position="end">g/mol</InputAdornment>,
                              },
                            }}
                          />
                        )}
                      />
                    </Stack>
                  </Box>
                  <Divider />
                </>
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
              <Controller
                control={control}
                name="manufacturer"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Manufacturer"
                    error={!!error}
                    helperText={error && error.message}
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors(field.name);
                    }}
                  />
                )}
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
                              render={({ field, fieldState: { error } }) =>
                                metaData ? (
                                  <InputAdornment position="end">
                                    <Select
                                      {...field}
                                      error={!!error}
                                      label="Unit"
                                      value={formValues?.quantity_unit}
                                      autoWidth
                                      variant="standard"
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
                                      {/* TODO: Remove this check after implementing tanstack loading state */}
                                      {metaData &&
                                        metaData?.actions?.POST.quantity_unit.choices.map(
                                          (c, i) => (
                                            <MenuItem key={i} value={c.value}>
                                              {c.display_name}
                                            </MenuItem>
                                          )
                                        )}
                                    </Select>
                                  </InputAdornment>
                                ) : (
                                  <></>
                                )
                              }
                            />
                          ),
                        },
                      }}
                    />
                  )}
                />
              </Stack>
              <Controller
                control={control}
                name="product_num"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Product #"
                    error={!!error}
                    helperText={error && error.message}
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors(field.name);
                    }}
                  />
                )}
              />
              <Controller
                control={control}
                name="date_received"
                rules={{
                  required: {
                    value: true,
                    message: 'Required',
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <DateField
                    {...field}
                    label="Date Received"
                    value={dayjs(field.value)}
                    clearable
                    disableFuture
                    error={!!error}
                    helperText={error && error.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="density"
                rules={{
                  pattern: {
                    value: /^\d+(\.\d+)?$/,
                    message: 'Please input a integer or decimal',
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Density/Specific Gravity"
                    error={!!error}
                    helperText={error && error.message}
                    onChange={(e) => {
                      field.onChange(e);
                      clearErrors(field.name);
                    }}
                  />
                )}
              />
              <Controller
                control={control}
                name="expiration_date"
                render={({ field, fieldState: { error } }) => (
                  <DateField
                    {...field}
                    label="Expiration Date"
                    clearable
                    error={!!error}
                    helperText={error && error.message}
                    value={dayjs(field.value)}
                  />
                )}
              />
              <Stack direction={'row'} spacing={2}>
                <Controller
                  control={control}
                  name="initial_weight"
                  rules={{
                    required: {
                      value: true,
                      message: 'Required',
                    },
                    pattern: {
                      value: /^\d+(\.\d+)?$/,
                      message: 'Please input a integer or decimal',
                    },
                  }}
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Initial Weight"
                      error={!!error}
                      helperText={error && error.message}
                      onChange={(e) => {
                        field.onChange(e);
                        clearErrors(field.name);
                      }}
                      slotProps={{
                        input: {
                          endAdornment: <InputAdornment position="end">g</InputAdornment>,
                        },
                      }}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="tare_weight"
                  rules={{
                    required: {
                      value: true,
                      message: 'Required, estimate if needed',
                    },
                    pattern: {
                      value: /^\d+(\.\d+)?$/,
                      message: 'Please input a integer or decimal',
                    },
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
                  render={({ field, fieldState: { error } }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Tare Weight"
                      error={!!error}
                      helperText={error && error.message}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                        clearErrors(field.name);
                      }}
                      slotProps={{
                        input: {
                          endAdornment: <InputAdornment position="end">g</InputAdornment>,
                        },
                      }}
                    />
                  )}
                />
              </Stack>
              <Divider />
              <Stack direction={'row'} spacing={2} sx={{ justifyContent: 'right' }}>
                <Button variant="contained" type="submit">
                  Submit
                </Button>
                <Button variant="outlined">Cancel</Button>
              </Stack>
            </Stack>
          </Box>
        </Card>
      </FormProvider>
    </Container>
  );
};
