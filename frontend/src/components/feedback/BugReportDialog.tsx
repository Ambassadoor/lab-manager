import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormHelperText,
  Link,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { CheckCircleOutlined } from '@mui/icons-material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { createBugReport } from '../../api/feedback';
import { APP_VERSION, type Diagnostics } from '../../diagnostics';
import type { BugImpact } from '../../types';
import { submitErrorMessage } from './submitErrorMessage';
import { useFullScreenOnPhone } from '../shared/useFullScreenOnPhone';

type BugReportDialogProps = {
  open: boolean;
  onClose: () => void;
  // Captured by FeedbackProvider when the dialog was opened.
  diagnostics: Diagnostics | null;
  fromCrash: boolean;
};

type BugReportFormValues = {
  summary: string;
  description: string;
  impact: BugImpact;
  includeDiagnostics: boolean;
};

// Plain-language labels, mirroring BugReport.Impact on the backend.
const IMPACT_OPTIONS: { value: BugImpact; label: string }[] = [
  { value: 'blocking', label: "I can't continue" },
  { value: 'annoying', label: "It's annoying, but I can work around it" },
  { value: 'minor', label: 'Minor or cosmetic' },
];

export const BugReportDialog = ({
  open,
  onClose,
  diagnostics,
  fromCrash,
}: BugReportDialogProps) => {
  const fullScreen = useFullScreenOnPhone();
  const [showDetails, setShowDetails] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BugReportFormValues>({
    defaultValues: {
      summary: fromCrash ? 'The page crashed with "Something went wrong"' : '',
      description: '',
      impact: fromCrash ? 'blocking' : 'annoying',
      includeDiagnostics: true,
    },
  });

  const mutation = useMutation({ mutationFn: createBugReport });

  const onSubmit = (values: BugReportFormValues) => {
    mutation.mutate({
      summary: values.summary.trim(),
      description: values.description.trim(),
      impact: values.impact,
      route: diagnostics?.url ?? window.location.pathname,
      app_version: APP_VERSION,
      diagnostics: values.includeDiagnostics && diagnostics ? diagnostics : {},
    });
  };

  if (mutation.isSuccess) {
    const report = mutation.data;
    return (
      <Dialog fullWidth open={open} onClose={onClose}>
        <DialogContent>
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 2 }}>
            <CheckCircleOutlined color="success" sx={{ fontSize: 56 }} />
            <Typography variant="h6">Thanks, your report was sent.</Typography>
            <Typography color="text.secondary">Reference #{report.id}</Typography>
            {report.github_issue_url && (
              <Link href={report.github_issue_url} target="_blank" rel="noopener noreferrer">
                Follow its progress on GitHub
              </Link>
            )}
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
      <DialogTitle>Report a problem</DialogTitle>
      <DialogContent>
        {mutation.isError && (
          <Alert severity="error" onClose={() => mutation.reset()} sx={{ mb: 2 }}>
            {submitErrorMessage(mutation.error)}
          </Alert>
        )}
        {fromCrash && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Details about the error will be included automatically.
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Controller
            control={control}
            name="summary"
            rules={{
              validate: (v) => v.trim() !== '' || 'Please describe the problem in a few words.',
              maxLength: { value: 200, message: 'Please keep this under 200 characters.' },
            }}
            render={({ field }) => (
              <TextField
                {...field}
                autoFocus
                label="What went wrong?"
                placeholder="e.g. The Save button doesn't do anything"
                error={!!errors.summary}
                helperText={errors.summary?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <TextField
                {...field}
                multiline
                minRows={3}
                label="What were you doing when it happened? (optional)"
              />
            )}
          />
          <Typography variant="caption" color="text.secondary">
            What you type above may be shared publicly with the app&apos;s developers on GitHub.
            Please don&apos;t include names, passwords, or other personal information.
          </Typography>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              How much is this affecting you?
            </Typography>
            <Controller
              control={control}
              name="impact"
              render={({ field: { value, onChange } }) => (
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  orientation="vertical"
                  color="primary"
                  value={value}
                  // Ignore clicks that would deselect — one option is always chosen.
                  onChange={(_e, next: BugImpact | null) => next && onChange(next)}
                >
                  {IMPACT_OPTIONS.map((option) => (
                    <ToggleButton
                      key={option.value}
                      value={option.value}
                      // The default selected style (tinted text on a faint
                      // background) reads as *disabled* in dark mode — fill it.
                      sx={{
                        textTransform: 'none',
                        '&.Mui-selected, &.Mui-selected:hover': {
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                        },
                      }}
                    >
                      {option.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
            />
          </Box>
          <Box>
            <Controller
              control={control}
              name="includeDiagnostics"
              render={({ field: { value, onChange } }) => (
                <FormControlLabel
                  control={
                    <Checkbox checked={value} onChange={(e) => onChange(e.target.checked)} />
                  }
                  label="Include technical details"
                />
              )}
            />
            <FormHelperText sx={{ mt: 0 }}>
              Recent errors, your browser, and screen size. These stay private to the lab&apos;s
              administrators and aren&apos;t posted publicly.{' '}
              <Link component="button" type="button" onClick={() => setShowDetails((s) => !s)}>
                {showDetails ? 'Hide' : 'See what will be sent'}
              </Link>
            </FormHelperText>
            <Collapse in={showDetails}>
              <Box
                component="pre"
                sx={{
                  mt: 1,
                  p: 1,
                  maxHeight: 300,
                  overflow: 'auto',
                  fontSize: 12,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(diagnostics, null, 2)}
              </Box>
            </Collapse>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained" loading={mutation.isPending}>
          Send report
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
