import { Stack } from '@mui/material';
import type { Control, UseFormClearErrors } from 'react-hook-form';
import { LIPSCOMB_EMAIL_PATTERN, LIPSCOMB_ID_PATTERN } from '../shared/formRules';
import { RhfTextField } from '../shared/RhfTextField';
import type { UserFormValues } from './userForm';

type UserFieldsProps = {
  control: Control<UserFormValues>;
  clearErrors: UseFormClearErrors<UserFormValues>;
};

// The account fields shared by Profile and UserEditForm — same fields, same
// rules. (Register has its own: passwords, availability pre-checks, and
// errors deferred until a field is touched — but shares the patterns.)
export const UserFields = ({ control, clearErrors }: UserFieldsProps) => (
  <Stack spacing={2}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <RhfTextField
        control={control}
        name="first_name"
        label="First Name"
        autoComplete="given-name"
        rules={{ required: 'First name is required' }}
        clearErrors={clearErrors}
        fullWidth
      />
      <RhfTextField
        control={control}
        name="last_name"
        label="Last Name"
        autoComplete="family-name"
        rules={{ required: 'Last name is required' }}
        clearErrors={clearErrors}
        fullWidth
      />
    </Stack>
    <RhfTextField
      control={control}
      name="email"
      label="Email"
      autoComplete="email"
      rules={{
        required: 'Email is required',
        pattern: { value: LIPSCOMB_EMAIL_PATTERN, message: 'Must be a Lipscomb email address' },
      }}
      clearErrors={clearErrors}
      fullWidth
    />
    <RhfTextField
      control={control}
      name="username"
      label="Username"
      autoComplete="username"
      rules={{ required: 'Username is required' }}
      clearErrors={clearErrors}
      fullWidth
    />
    <RhfTextField
      control={control}
      name="lipscomb_id"
      label="Lipscomb ID"
      rules={{
        validate: (value) =>
          !value || LIPSCOMB_ID_PATTERN.test(value) || 'Please match L12345678 format',
      }}
      clearErrors={clearErrors}
      fullWidth
    />
  </Stack>
);
