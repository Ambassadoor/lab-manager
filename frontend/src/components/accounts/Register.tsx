import { Box, Button, Card, Container, Divider, Stack, TextField, Typography } from "@mui/material"
import { useEffect } from "react"
import { Controller, useForm, useWatch, type SubmitHandler } from "react-hook-form"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"

type Inputs = {
    username: string,
    password: string,
    confirm_password: string,
    email: string,
    first_name: string,
    last_name: string,
    lipscomb_id: string,
}

export const Register = () => {
    const {preValidate} = useAuth()
    const navigate = useNavigate()

    const {
        control,
        handleSubmit,
        formState: {errors, isSubmitting, touchedFields, dirtyFields},
        setError,
        clearErrors,
        resetField,
        getValues,
        trigger
    } = useForm<Inputs>();

    const password = useWatch({
        control,
        name: "password"
    })

    const username = useWatch({
        control,
        name: "username"
    })

    const email = useWatch({
        control,
        name: "email"
    })

    useEffect(() => {
        if (touchedFields.email) {
        preValidate("email", email).then(res => {
            if (res) {
                setError("email", {
                    type: "manual",
                    message: res.errors.email
                })
            } else {
                clearErrors("email")
            }
            resetField("email", {
                keepError: true,
                defaultValue: getValues('email')
            })              
        })
        } else if (dirtyFields.email) {
            clearErrors("email")
        }

    }, [touchedFields.email, email, preValidate, setError, getValues, resetField, clearErrors, dirtyFields.email])

    useEffect(() => {
        if (touchedFields.username) {
            preValidate("username", username).then(res => {
                if (res) {
                    setError("username", {
                        type: "manual",
                        message: res.errors.username
                    })
                } else {
                    clearErrors("username")
                }
                resetField("username", {
                    keepError: true,
                    defaultValue: getValues("username")
                })
            })
        } else if (dirtyFields.username) {
            clearErrors("username")
        }
    })
    const onSubmit: SubmitHandler<Inputs> = (data): Promise<void> => {

    }



    return (
    <Container
      sx={{
        padding: { sm: 4, md: 2 },
      }}
    >
      <Card
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'center',
          width: '100%',
          padding: 4,
          gap: 2,
          margin: 'auto',
          maxWidth: { sm: '450px' },
        }}
      >
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={2}>
            <Typography component={'h1'} variant="h4">
              Create Account
            </Typography>
            <Stack direction={"row"} spacing={2}>
            <Controller 
                name="first_name"
                control={control}
                defaultValue={""}
                rules={{
                    required: "First name is required",
                }}
                render={({field}) => (
                    <TextField
                        {...field}
                        label="First Name"
                        error={!!errors.first_name}
                        helperText={errors.first_name? errors.first_name.message : ''}  
                        fullWidth
                    />
                )}
            />
            <Controller 
                name="last_name"
                control={control}
                defaultValue={""}
                rules={{
                    required: "Last name is required",
                }}
                render={({field}) => (
                    <TextField
                        {...field}
                        label="Last Name"
                        error={!!errors.last_name}
                        helperText={errors.last_name? errors.last_name.message : ''}  
                        fullWidth
                    />
                )}
            />
            </Stack>
            <Controller
                name="email"
                control={control}
                defaultValue=""
                rules={{
                    required: "Email is required",
                    pattern: {
                        value: /^[a-zA-Z0-9._%+-]+@(mail\.)?lipscomb\.edu$/,
                        message: "Please use your Lipscomb email address"
                    }
                }}
                render={({field}) => (
                    <TextField
                        {...field}
                        label="Email"
                        error={!!errors.email}
                        helperText={errors.email ? errors.email.message : ''}
                        fullWidth
                    />
                )}
            />
            <Controller
              name="username"
              control={control}
              defaultValue={''}
              rules={{
                required: 'Username is required',
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Username"
                  error={!!errors.username}
                  helperText={errors.username ? errors.username.message : ''}
                  fullWidth
                />
              )}
            />
            <Controller
              name="password"
              control={control}
              defaultValue={''}
              rules={{
                required: 'Password is required',
                minLength: {value: 8, message: "Minimum 8 characters"}
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Password"
                  type="password"
                  error={!!errors.password}
                  helperText={errors.password ? errors.password.message : ''}
                  fullWidth
                />
              )}
            />
            <Controller
              name="confirm_password"
              control={control}
              defaultValue={''}
              rules={{
                required: 'Please confirm password',
                validate: (value) => value === password || "Passwords do not match"
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Confirm Password"
                  type="password"
                  error={!!errors.confirm_password}
                  helperText={errors.confirm_password ? errors.confirm_password.message : ''}
                  fullWidth
                  onChange={(e) => {
                    field.onChange(e);
                    trigger("confirm_password")}}
                />
              )}
            />
            <Controller
                name="lipscomb_id"
                control={control}
                defaultValue=""
                rules={{
                    required: "Please provide your Lipscomb Id",
                    pattern: {
                        value: /^L[0-9]{8}$/,
                        message: "Please use L######## format"
                    }
                }}
                render={({field}) => (
                    <TextField 
                        {...field}
                        label="Lipscomb ID"
                    />
                )}
            />
            <Stack direction={"row"} spacing={2}>
                <Button
                type="submit"
                variant="contained"
                color="primary"
                size="large"
                disabled={isSubmitting}
                fullWidth
                >
                Submit
                </Button>
                <Button
                variant="outlined"
                size="large"
                fullWidth
                onClick={() => navigate("/")}
                >Cancel</Button>

            </Stack>
          </Stack>
        </Box>
      </Card>
    </Container>
    )
}