import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircleOutlined } from '@mui/icons-material';
import { Controller, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { createFeedback } from '../../api/feedback';
import { useAuth } from '../../context/AuthContext';
import type { FeedbackCategory } from '../../types';
import { submitErrorMessage } from './submitErrorMessage';
import { useFullScreenOnPhone } from '../shared/useFullScreenOnPhone';

type FeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
  // Path the user was on when they opened the dialog.
  route: string;
};

type FeedbackFormValues = {
  category: FeedbackCategory | null;
  body: string;
  aboutThisPage: boolean;
  mayContact: boolean;
};

// Mirrors Feedback.Category on the backend.
const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: 'confusing', label: 'Something was confusing' },
  { value: 'tedious', label: 'Something is slow or tedious' },
  { value: 'idea', label: 'I have an idea' },
  { value: 'other', label: 'Other' },
];

// General UI/UX feedback — stored for the lab managers to read, not sent to
// GitHub unless one of them promotes it. No diagnostics are attached.
export const FeedbackDialog = ({ open, onClose, route }: FeedbackDialogProps) => {
  const fullScreen = useFullScreenOnPhone();
  const { user } = useAuth();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FeedbackFormValues>({
    defaultValues: { category: null, body: '', aboutThisPage: true, mayContact: false },
  });

  const mutation = useMutation({ mutationFn: createFeedback });

  const onSubmit = (values: FeedbackFormValues) => {
    mutation.mutate({
      category: values.category!,
      body: values.body.trim(),
      route: values.aboutThisPage ? route : '',
      // Can't follow up with an anonymous visitor.
      may_contact: !!user && values.mayContact,
    });
  };

  if (mutation.isSuccess) {
    return (
      <Dialog fullWidth open={open} onClose={onClose}>
        <DialogContent>
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
            <CheckCircleOutlined color="success" sx={{ fontSize: 56 }} />
            <Typography variant="h6">Thanks for the feedback!</Typography>
            <Typography color="text.secondary">It helps us make the app easier to use.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      fullScreen={fullScreen}
      fullWidth
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      open={open}
      onClose={onClose}
      disableRestoreFocus
    >
      <DialogTitle>Send feedback</DialogTitle>
      <DialogContent>
        {mutation.isError && (
          <Alert severity="error" onClose={() => mutation.reset()} sx={{ mb: 2 }}>
            {submitErrorMessage(mutation.error)}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              What kind of feedback is it?
            </Typography>
            <Controller
              control={control}
              name="category"
              rules={{ validate: (v) => v !== null || 'Please pick one.' }}
              render={({ field: { value, onChange } }) => (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  {CATEGORY_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      clickable
                      color={value === option.value ? 'primary' : 'default'}
                      variant={value === option.value ? 'filled' : 'outlined'}
                      onClick={() => onChange(option.value)}
                    />
                  ))}
                </Stack>
              )}
            />
            {errors.category && <FormHelperText error>{errors.category.message}</FormHelperText>}
          </Box>
          <Controller
            control={control}
            name="body"
            rules={{ validate: (v) => v.trim() !== '' || 'Please tell us a little more.' }}
            render={({ field }) => (
              <TextField
                {...field}
                multiline
                minRows={4}
                label="Tell us more"
                placeholder="What happened, or what would make this easier?"
                error={!!errors.body}
                helperText={errors.body?.message}
              />
            )}
          />
          {/* Own Box, not direct Stack children — Stack's spacing resets
              FormControlLabel's negative left margin, which is what lines the
              checkbox up with the text field's edge. */}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Controller
              control={control}
              name="aboutThisPage"
              render={({ field: { value, onChange } }) => (
                <FormControlLabel
                  control={
                    <Checkbox checked={value} onChange={(e) => onChange(e.target.checked)} />
                  }
                  label="This is about the page I'm on"
                />
              )}
            />
            {user && (
              <Controller
                control={control}
                name="mayContact"
                render={({ field: { value, onChange } }) => (
                  <FormControlLabel
                    control={
                      <Checkbox checked={value} onChange={(e) => onChange(e.target.checked)} />
                    }
                    label="It's OK to contact me about this"
                  />
                )}
              />
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained" loading={mutation.isPending}>
          Send feedback
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
