import { Add, ArrowDropDown, Remove } from "@mui/icons-material"
import { Accordion, AccordionDetails, AccordionSummary, Box, Card, Checkbox, Container, Divider, FormControl, FormControlLabel, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material"
import { useEffect, useState } from "react"
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form"
import { getChemicalByCas, getContainerMetaData, getLocations, getStorageCategories } from "../../api/inventory"
import { DateField } from "@mui/x-date-pickers"

export const ContainerForm = () => {
    const [chemicalStorageCategories, setChemicalStorageCategories] = useState([])
    const [locations, setLocations] = useState([])
    const [metaData, setMetaData] = useState()
    const [cas, setCas] = useState([])

    const {control, clearErrors, formState: { errors, dirtyFields, touchedFields }, setValue,  ...methods} = useForm({
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        defaultValues: {
            name: "",
            multiple_cas: false,
            mixture_name: "",
            mixture_location: null,
            mixture_molecular_weight: null,
            chemicals: [
                {
                    cas: null,
                    name: "",
                    molecular_weight: null,
                    storage_category: null
                }
            ],
            location: null,
            manufacturer: "",
            initial_quantity: null,
            quantity_unit: "g",
            product_num: "",
            date_received: null,
            density: null,
            expiration_date: null,
            initial_weight: null,
            tare_weight: null
        }
    })
    const { fields, append, remove} = useFieldArray({
        control: control, 
        name:"chemicals"
    })

    const formValues = useWatch({ control })

    useEffect(() => {
        getStorageCategories().then(setChemicalStorageCategories)
        getLocations().then(setLocations)
        getContainerMetaData().then(setMetaData)
    },[])

    useEffect(() => {
        if (!formValues || !formValues.chemicals) return
        const cas = formValues?.chemicals?.map((c,i) => {
            if (!errors?.chemicals?.[i]?.cas) {
                return {index: i, cas: c.cas}
            }
            else return {}
        }
        )
        if (!cas) return
        const casString = cas?.map((c) => {
            if (c.cas) return c.cas
        }).join(",")

        if (casString) getChemicalByCas(casString).then(res => {
            res.chemicals.forEach((c) => {
                const name = cas.find((o) => {
                    return o.cas === c.cas
                })
                if (name?.index !== undefined) {
                    setValue(`chemicals.${name.index}.name`, c.name)
                    if (c.molecular_weight) setValue(`chemicals.${name.index}.molecular_weight`, Number(c.molecular_weight))
                    if (c.storage_category) setValue(`chemicals.${name.index}.storage_category`, c.storage_category.id)
                }
            })
            setCas(res)
        
        })
    },[formValues.chemicals, errors?.chemicals, setValue, formValues])

    return (
        <Container 
            sx={{
                padding: 4
            }}
        >
            <FormProvider {...methods}>
                <Card sx={{
                    display: 'flex',
                    maxWidth: '66vw',
                    flexDirection: 'column',
                    alignSelf: 'center',
                    margin: 'auto',
                    padding: 4
                }}>
                    <Box component={"form"}>
                        <Stack spacing={2}>
                            <Typography component={"h1"} variant={"h4"}>Add New Container</Typography>
                            <Controller
                                control={control}
                                name="name"
                                render={({field}) => (
                                    <TextField
                                        {...field}
                                        label="Product Name"
                                    />
                                )}
                            />
                            <Controller 
                                control={control}
                                name="multiple_cas"
                                render={({field: {value, onChange, ...field}}) => (
                                    <FormControlLabel 
                                    control={
                                        <Checkbox 
                                        {...field} 
                                        checked={!!value}
                                        onChange={(e) => onChange(e.target.checked)}
                                        />
                                    } 
                                    label="Multiple CAS Numbers?"/>
                                )}
                            />
                            {
                                formValues.multiple_cas &&
                                <>
                                <Controller 
                                    control={control}
                                    name={`mixture_name`}
                                    render={({field}) => (
                                        <TextField 
                                            {...field}
                                            label="Mixture Name"
                                            fullWidth
                                        />
                                    )}
                                />
                                <Controller 
                                    control={control}
                                    name={"mixture_location"}
                                    render={({field}) => (
                                        <FormControl>
                                        <InputLabel id="sc_label">Storage Category</InputLabel>
                                        <Select
                                            {...field}
                                            labelId="sc_label"
                                            label="Storage Category"
                                            value={formValues?.mixture_location}
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
                                <Controller 
                                    control={control}
                                    name={"mixture_molecular_weight"}
                                    render={({field}) => (
                                        <TextField 
                                            {...field}
                                            label="Molecular Weight"
                                        />
                                    )}
                                />
                                <Divider />
                                </>
                            }
                            {fields.map((item, index) => (
                                <Stack spacing={2} key={item.id}>
                                    <Controller 
                                        control={control}
                                        name={`chemicals.${index}.cas`}
                                        rules={{
                                            pattern: {
                                                value: /^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$/,
                                                message: "Invalid CAS format" 
                                            },
                                            validate: {
                                                required: (value) => {
                                                    if (value === "" ) return "CAS is required"
                                                },
                                                check_digit: (value) => {
                                                    if (!value) return true
                                                    const parts = value.split("-")
                                                    const check_digit = parts[2]
                                                    const formatted = parts.join("").split("").reverse()
                                                    let sum = 0
                                                    formatted.forEach((d,i) => {
                                                        sum += i * Number(d)
                                                    })
                                                    if (sum % 10 !== Number(check_digit)) {
                                                        return "Invalid CAS number"
                                                    }
                                                },
                                                duplicate: async (value) => {
                                                    if (!formValues?.chemicals) return true
                                                    const casNums = formValues.chemicals.map((c,i) => {
                                                        if (i !== index) {
                                                            return c.cas
                                                        }
                                                    })
                                                    if (casNums.includes(value)) return "Duplicate CAS #"
                                                }
                                            }
                                        }}
                                        render={({field, fieldState: {error, isDirty, isTouched}}) => (
                                            <TextField 
                                                {...field}
                                                label="CAS #"
                                                error={!!error}
                                                helperText={error ? error.message: ""}
                                                fullWidth
                                                onChange={(e) => {
                                                    field.onChange(e);
                                                    clearErrors(`chemicals.${index}.cas`)
                                                }}
                                                slotProps={{
                                                    input: {
                                                        endAdornment: (
                                                            formValues.multiple_cas &&
                                                            <InputAdornment position="end">
                                                                {index + 1 === fields.length &&
                                                                <IconButton onClick={() => {
                                                                    append({
                                                                        cas: null,
                                                                        name: "",
                                                                        molecular_weight: null,
                                                                        storage_category: null
                                                                    })
                                                                }}>
                                                                    <Add/>
                                                                </IconButton>
                                                                }
                                                                {
                                                                    index > 0 &&
                                                                    <IconButton onClick={() => {
                                                                        remove(index)
                                                                    }}>
                                                                        <Remove />
                                                                    </IconButton>
                                                                }
                                                            </InputAdornment>                                                         
                                                        )
                                                    }
                                                }}
                                            />
                                        )}
                                    />
                                    {formValues?.chemicals?.[index]?.cas &&
                                    <Box>
                                        <Accordion defaultExpanded>
                                            <AccordionSummary
                                                expandIcon={<ArrowDropDown/>}
                                            >
                                                <Typography component={"span"}>{`Chemical Info for ${formValues?.chemicals?.[index].cas}`}</Typography>
                                            </AccordionSummary>
                                            <AccordionDetails>
                                                <Stack spacing={2}>
                                                    <Controller
                                                        name={`chemicals.${index}.name`}
                                                        control={control}
                                                        render={({field}) => (
                                                            <TextField 
                                                                {...field}
                                                                label={`Name`}
                                                            />
                                                    )}
                                                    />
                                                    <Controller 
                                                        name={`chemicals.${index}.molecular_weight`}
                                                        control={control}
                                                        render={({field}) => (
                                                            <TextField 
                                                                {...field}
                                                                label={"Molecular Weight"}
                                                            />
                                                        )}
                                                    />
                                                    <Controller
                                                        name={`chemicals.${index}.storage_category`}
                                                        control={control}
                                                        render={({field}) => (
                                                            <FormControl>
                                                            <InputLabel id="sc_label">Storage Category</InputLabel>
                                                            <Select
                                                                {...field}
                                                                labelId="sc_label"
                                                                label="Storage Category"
                                                                value={formValues?.chemicals?.[index].storage_category}
                                                            >
                                                                {chemicalStorageCategories.map((c) => (
                                                                    <MenuItem key={c.id} value={c.id}>
                                                                        {c.shorthand}
                                                                    </MenuItem> 
                                                                ))}
                                                            </Select>
                                                            </FormControl>
                                                        )}/>
                                                </Stack>
                                            </AccordionDetails>
                                        </Accordion>
                                    </Box>
                                    
                            }
                                </Stack>
                            ))}
                            <Controller 
                                control={control}
                                name="location"
                                render={({field}) => (
                                    <FormControl>
                                        <InputLabel id="location">Location</InputLabel>
                                        <Select
                                        {...field}
                                        labelId="location"
                                        label="Location"
                                        >
                                        {locations.map((l) => (
                                            <MenuItem key={l.id} value={l.id}>
                                                {l.full_path}
                                            </MenuItem>
                                        ))}
                                        </Select>
                                    </FormControl>
                                )}
                            />
                            <Controller 
                                control={control}
                                name="manufacturer"
                                render={({field}) => (
                                    <TextField 
                                        {...field}
                                        label="Manufacturer"
                                    />
                                )}
                            />
                            <Stack direction={"row"} spacing={2}>
                            <Controller 
                                control={control}
                                name="initial_quantity"
                                render={({field}) => (
                                    <TextField 
                                        label="Initial Quantity"
                                        fullWidth
                                    />
                                )}
                            />                        
                            <Controller 
                                control={control}
                                name="quantity_unit"
                                render={({field}) => (
                                    <FormControl fullWidth>
                                        <InputLabel id="unit">Unit</InputLabel>
                                        <Select
                                        {...field}
                                        labelId="unit"
                                        label="Unit"
                                        value={formValues?.quantity_unit}
                                        >
                                        {metaData?.actions?.POST.quantity_unit.choices.map((c,i) => (
                                            <MenuItem key={i} value={c.value}>{c.display_name}</MenuItem>
                                        ))}
                                        </Select>
                                    </FormControl>
                                )}
                            />
                            </Stack>
                            <Controller 
                                control={control}
                                name="product_num"
                                render={({field}) => (
                                    <TextField 
                                        {...field}
                                        label="Product #"
                                    />
                                )}
                            />
                            <Controller 
                                control={control}
                                name="date_received"
                                render={({field}) => (
                                    <DateField
                                        {...field} 
                                        label="Date Received"
                                        clearable
                                        disableFuture
                                    />
                                )}
                            />
                            <Controller 
                                control={control}
                                name="density"
                                render={({field}) => (
                                    <TextField 
                                        {...field}
                                        label="Density/Specific Gravity"                                        
                                    />
                                )}
                            />
                            <Controller 
                                control={control}
                                name="expiration_date"
                                render={({field}) => (
                                    <DateField 
                                    {...field}
                                    label="Expiration Date"
                                    clearable
                                    />
                                )}
                            />
                            <Stack direction={"row"} spacing={2}>
                            <Controller 
                                control={control}
                                name="initial_weight"
                                render={({field}) => (
                                    <TextField 
                                        {...field}
                                        fullWidth
                                        label="Initial Weight"
                                        slotProps={{
                                            input: {
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        g
                                                    </InputAdornment>
                                                )
                                            }
                                        }}
                                    />
                                )}
                            />
                            <Controller 
                                control={control}
                                name="tare_weight"
                                render={({field}) => (
                                    <TextField 
                                        {...field}
                                        fullWidth
                                        label="Tare Weight"
                                        slotProps={{
                                            input: {
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        g
                                                    </InputAdornment>
                                                )
                                            }
                                        }}
                                    />
                                )}
                            />
                            </Stack>
                        </Stack>
                    </Box>
                </Card>
            </FormProvider>
        </Container>
    )
}