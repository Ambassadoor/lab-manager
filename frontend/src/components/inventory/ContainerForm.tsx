import { Accordion, AccordionDetails, AccordionSummary, Box, Card, Container, IconButton, InputAdornment, MenuItem, Select, Stack, TextField, Typography } from "@mui/material"
import { useEffect, useState } from "react";
import { Controller, useForm, useFieldArray, useWatch } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { Add, ArrowDownward, ArrowDropDown, Remove } from "@mui/icons-material";
import { getChemicalByCas } from "../../api/inventory";

    const CASField = ({index, control, append, remove, errors, dirtyFields, clearErrors, fields}) => {

        return (
                <Controller
                    name={`cas.${index}.number`}
                    control={control}
                    rules={{
                        pattern: {
                            value: /^[0-9]{2,7}-[0-9]{2}-[0-9]{1}$/,
                            message: "Invalid CAS format"
                        },
                        validate: {
                            required: async (value) => {
                            if (!dirtyFields.cas?.[index].number) return true;
                            if (!value) return "CAS is required"
                            },
                            check_digit: (value) => {
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
                            }
                        }
                    }}
                    render={({field, fieldState: {error}}) => (
                        <TextField
                            {...field}
                            label="CAS #"
                            error={!!error}
                            helperText={error ? error.message : ''}
                            fullWidth
                            onChange={(e) => {
                                field.onChange(e);
                                clearErrors(`cas.${index}.number`)
                            }}
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            {index + 1 === fields.length &&
                                            <IconButton onClick={() => {
                                                append({number: ""})
                                            }}>
                                                <Add/>
                                            </IconButton>
                                            }
                                            {
                                            index > 0 &&
                                            <IconButton onClick={() => {
                                                remove(index)
                                            }}>
                                                <Remove/>
                                            </IconButton>
                                            }
                                        </InputAdornment>
                                    )
                                }
                            }}
                        />

                    )}
                />
        )
    }

export const ContainerForm = () => {
    const [chemOptions, setChemOptions] = useState([])
    const navigate = useNavigate();
    
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting, dirtyFields, isDirty},
        clearErrors,
        getValues,
    } = useForm({
        mode: 'onBlur',
        reValidateMode: 'onBlur',
        defaultValues: {
            cas: [
                { number: ""}
            ]
        }
    })

    const { fields, append, remove } = useFieldArray({
        control,
        name: "cas"
    })

    const formValues = useWatch({ control })

    useEffect(() => {
        sessionStorage.setItem('container_form_cache', JSON.stringify(formValues))
    },[formValues])

    useEffect(() => {
        const cas = getValues('cas')
        const nums = cas.map(num => num.number).join(",")
        getChemicalByCas(nums).then(setChemOptions)

    },[formValues.cas])

    return (
        <Container
            sx={{
                padding: {sm: 4, md: 2}
            }}>
            <Card
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignSelf: 'center',
                    width: '100%',
                    padding: 4,
                    gap: 2,
                    margin: 'auto',
                    maxWidth: '50vw'
                }}
            >
                <Box component="form">
                    <Stack spacing={2}>
                        <Typography component={'h1'} variant="h4">
                            Add Container
                        </Typography>
                        <Controller 
                            name="name"
                            control={control}
                            render={({field}) => (
                                <TextField 
                                    {...field}
                                    autoComplete="name"
                                    label="Name"
                                    error={!!errors.name}
                                    helperText={errors.name ? errors.name.message : ''}
                                    fullWidth
                                    onChange={(e) => {
                                        field.onChange(e);
                                        clearErrors('name')
                                    }}
                                />
                            )}
                        />
                        {fields.map((item, index) => (
                            <CASField 
                            key={item.id} 
                            index={index} 
                            control={control} 
                            append={append} 
                            remove={remove} 
                            errors={errors}
                            clearErrors={clearErrors}
                            dirtyFields={dirtyFields}
                            fields={fields}
                            />
                        ))}
                        <Accordion>
                            <AccordionSummary
                                expandIcon={<ArrowDropDown/>}
                            >
                                <Typography component={"span"}>Chemical Info</Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <Stack spacing={2}>
                                <Controller
                                    name="chemical"
                                    control={control}
                                    render={({field}) => (
                                        <Select
                                            {...field}
                                            label="Chemical"
                                            fullWidth
                                        >
                                            <MenuItem value="">Choose</MenuItem>
                                            {chemOptions.map((o) => (
                                                <MenuItem value={o.id}>{o.name}</MenuItem>
                                            ))}
                                        </Select>
                                    )}
                                />
                                <Controller
                                    name="molecular_weight"
                                    control={control}
                                    render={({field}) => (
                                        <TextField
                                        {...field}
                                        label="Molecular Weight"
                                        fullWidth
                                        />
                                    )}
                                />
                                <Controller
                                    name="storage_category"
                                    control={control}
                                    render={({field}) => (
                                        <Select
                                        {...field}
                                        label="Storage Category"
                                        fullWidth
                                        >

                                        </Select>
                                    )}
                                />
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                        {/* <Controller
                            name="chemical"
                            control={control}
                            rules={{}}
                            render={({ field }) => (
                                <Select 
                                    label="Chemical"
                                    error={!!errors.cas}
                                    helperText={errors.chemical ? errors.chemical.message : ''}
                                    fullWidth
                                    onChange={(e) => {
                                        field.onChange(e);
                                        clearErrors('chemical')
                                    }}
                                >
                                    {chemOptions.map((c) => (
                                        <MenuItem value={c.id}>{c.name}</MenuItem>
                                    ))}
                                </Select>
                        )}
                        /> */}
                    </Stack>
                </Box>
            </Card>
        </Container>
    )
}