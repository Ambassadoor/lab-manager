import { Alert, Box, CardContent, Stack } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateUser } from '../../api/users';
import { userKeys } from '../../api/queryKeys';
import type { Role, User } from '../../types';
import { applyApiErrors } from '../shared/applyApiErrors';
import { FormActions } from '../shared/FormActions';
import { RhfSelect } from '../shared/RhfSelect';
import { UserFields } from './UserFields';
import { userFormDefaults, type UserFormValues } from './userForm';

// Six roles that change rarely — a static list here, rather than a round
// trip to fetch choices dynamically (see QuantityUnitField's OPTIONS-based
// unit picker for the alternative, used where the choices are actually
// admin-configurable data).
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'lab_manager', label: 'Lab Manager' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'stockroom', label: 'Stockroom Worker' },
  { value: 'lab_assistant', label: 'Lab Assistant' },
];

type UserEditFormProps = {
  user: User;
  // Called on Cancel and after a successful save
  onDone: () => void;
};

// Edit-mode body of UserDetail's card — an admin editing another account, so
// unlike Profile it includes the role. Only mounted while editing (see
// ContainerEditForm, same pattern).
export const UserEditForm = ({ user, onDone }: UserEditFormProps) => {
  const qc = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    clearErrors,
    setError,
    handleSubmit,
    formState: { isDirty, isSubmitting },
  } = useForm<UserFormValues>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: { ...userFormDefaults(user), role: user.role },
  });

  const onSubmit = async (data: UserFormValues) => {
    setSubmitError(null);
    try {
      await updateUser(String(user.id), { ...data, lipscomb_id: data.lipscomb_id || null });
    } catch (e) {
      setSubmitError(applyApiErrors(e, data, setError));
      return;
    }
    // .all — an edit here can also change what shows in the Users list
    qc.invalidateQueries({ queryKey: userKeys.all });
    onDone();
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)}>
      <CardContent>
        <Stack spacing={2}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}
          <UserFields control={control} clearErrors={clearErrors} />
          <RhfSelect
            control={control}
            name="role"
            label="Role"
            rules={{ required: 'Role is required' }}
            clearErrors={clearErrors}
            options={ROLE_OPTIONS}
          />
        </Stack>
      </CardContent>
      <FormActions onCancel={onDone} isDirty={isDirty} loading={isSubmitting} />
    </Box>
  );
};
