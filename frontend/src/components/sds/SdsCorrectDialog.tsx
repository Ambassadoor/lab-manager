import { UploadFile } from '@mui/icons-material';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { correctSds, getSdsList } from '../../api/sds';
import { chemicalKeys, containerKeys, sdsKeys } from '../../api/queryKeys';
import type { GHSPictogram, SDS } from '../../types';
import { RhfDateField } from '../shared/RhfDateField';
import { useIsPhone } from '../shared/useIsPhone';
import { GhsPictogramSelect } from './GhsPictogramSelect';

type SdsCorrectDialogProps = {
  sds: SDS;
  open: boolean;
  onClose: () => void;
  // From a container: switches to attaching a different document to just
  // that container (SdsUploadDialog's replace mode). Left out on the SDS
  // page, which isn't about one container.
  onWrongDocument?: () => void;
};

type FormValues = {
  revision_date: Dayjs | null;
  revision_number: string;
  ghs_pictograms: GHSPictogram[];
};

// "Fix this document": corrects an SDS's revision date/number and
// pictograms, and can swap in the right PDF, for every container that
// shares the document (same Drive file). The Drive file is renamed to
// match and keeps its link. Stockroom and up.
export const SdsCorrectDialog = ({
  sds,
  open,
  onClose,
  onWrongDocument,
}: SdsCorrectDialogProps) => {
  const fullScreen = useIsPhone();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const { control, handleSubmit, reset } = useForm<FormValues>({
    values: {
      revision_date: sds.revision_date ? dayjs(sds.revision_date) : null,
      revision_number: sds.revision_number ?? '',
      ghs_pictograms: sds.ghs_pictograms ?? [],
    },
  });

  // How many containers this change reaches
  const { data: sharing } = useQuery({
    queryKey: sdsKeys.list({ drive_id: sds.drive_id }),
    queryFn: () => getSdsList({ drive_id: sds.drive_id }),
    enabled: open,
  });
  const sharedCount = sharing?.length ?? 1;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      correctSds(sds.id, {
        revisionDate: values.revision_date?.format('YYYY-MM-DD') ?? null,
        revisionNumber: values.revision_number.trim(),
        ghsPictograms: values.ghs_pictograms,
        file: file ?? undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sdsKeys.all });
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: chemicalKeys.all });
      setFile(null);
      onClose();
    },
  });

  const close = () => {
    reset();
    setFile(null);
    mutation.reset();
    onClose();
  };

  return (
    <Dialog
      fullScreen={fullScreen}
      fullWidth
      component="form"
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      open={open}
      onClose={close}
      disableRestoreFocus
    >
      <DialogTitle>Correct SDS</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {sds.file_name}
          </Typography>
          {sharedCount > 1 && (
            <Alert severity="info">
              This document is attached to {sharedCount} containers. The correction applies to all
              of them.
            </Alert>
          )}
          {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
          <RhfDateField
            control={control}
            name="revision_date"
            label="Revision Date"
            disableFuture
          />
          <Controller
            control={control}
            name="revision_number"
            render={({ field }) => <TextField {...field} label="Revision #" />}
          />
          <GhsPictogramSelect control={control} name="ghs_pictograms" />
          <Button component="label" variant="outlined" startIcon={<UploadFile />}>
            {file ? file.name : 'Replace the PDF (optional)'}
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Button>
          {onWrongDocument && (
            <Typography variant="body2">
              Is this the wrong document for this container altogether?{' '}
              <Link
                component="button"
                type="button"
                onClick={() => {
                  close();
                  onWrongDocument();
                }}
              >
                Attach a different SDS instead
              </Link>
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="submit" variant="contained" loading={mutation.isPending}>
          Save
        </Button>
        <Button onClick={close}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
