import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { OpenInNew, UploadFile } from '@mui/icons-material';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { createSds, getSdsList, type PendingSdsSelection } from '../../api/sds';
import { chemicalKeys, containerKeys, sdsKeys } from '../../api/queryKeys';
import { GHS_PICTOGRAMS, ghsPictogramLabel } from '../shared/ghsPictograms';
import { RhfDateField } from '../shared/RhfDateField';
import type { GHSPictogram, SDS } from '../../types';

type SdsUploadDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  // The container's own chemical id/manufacturer/product # — passed in
  // (rather than looked up here) so this stays reusable from ContainerForm,
  // where the container doesn't exist as a row yet. Used only to suggest
  // documents already on file for the same product: all three have to match
  // (not just manufacturer + product #) so two different chemicals that
  // happen to share a manufacturer/product # never cross-suggest each
  // other's safety document.
  chemicalId?: number | string | null;
  manufacturer?: string | null;
  productNum?: string | null;
} & (
  | {
      // Immediate mode (ContainerDetail, the Containers table): the
      // container already exists — submitting attaches the SDS right away.
      containerId: number | string;
      onUploaded?: (sds: SDS) => void;
      onSelect?: never;
    }
  | {
      // Deferred mode (ContainerForm): no container to attach to yet —
      // submitting just reports the picked file/existing-SDS selection back
      // to the caller (plus a human-readable label for it to display),
      // which stages it and does the actual createSds call itself once a
      // real container id exists.
      containerId?: undefined;
      onUploaded?: never;
      onSelect: (selection: PendingSdsSelection, label: string) => void;
    }
);

type SdsUploadFormValues = {
  revision_date: Dayjs | null | string;
  revision_number: string;
  ghs_pictograms: GHSPictogram[];
};

const defaultValues: SdsUploadFormValues = {
  revision_date: null,
  revision_number: '',
  ghs_pictograms: [],
};

// Shared modal for attaching an SDS to a container — reused by ContainerForm
// (once a new container's real id comes back), ContainerDetail, and the
// Containers table's inline upload button.
export const SdsUploadDialog = ({
  open,
  setOpen,
  containerId,
  chemicalId,
  manufacturer,
  productNum,
  onUploaded,
  onSelect,
}: SdsUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [existingId, setExistingId] = useState<number | null>(null);
  // Only used in deferred mode, to label the staged selection back to the
  // caller without having to re-look it up out of `suggestions` at submit
  // time (that list may have refetched/changed by then).
  const [existingLabel, setExistingLabel] = useState('');

  const { control, handleSubmit, reset, clearErrors, setValue } = useForm<SdsUploadFormValues>({
    mode: 'onBlur',
    defaultValues,
  });

  const suggestionParams = {
    chemical: chemicalId ?? undefined,
    manufacturer: manufacturer ?? undefined,
    product_num: productNum ?? undefined,
  };

  // Suggests documents already on file for the same product, so the same
  // physical SDS isn't uploaded to Drive again for every container that
  // happens to use it — revision date/# show per suggestion so the user can
  // tell them apart. Scoped to the same chemical too, not just manufacturer +
  // product #, so a coincidental match between two different chemicals never
  // suggests the wrong safety document.
  const { data: suggestions } = useQuery({
    queryKey: sdsKeys.list(suggestionParams),
    queryFn: () => getSdsList(suggestionParams),
    enabled: open && !!chemicalId && !!manufacturer && !!productNum,
  });

  // The same physical document can be attached (via this exact flow) to any
  // number of containers, each getting its own SDS row pointing at the same
  // drive_id — collapse those down to one suggestion per unique document.
  // Which row "wins" doesn't matter for what gets submitted: attaching only
  // ever needs drive_id/file_name, identical across every row that shares it.
  const uniqueSuggestions = useMemo(() => {
    if (!suggestions) return suggestions;
    const seen = new Set<string>();
    return suggestions.filter((s) => {
      if (seen.has(s.drive_id)) return false;
      seen.add(s.drive_id);
      return true;
    });
  }, [suggestions]);

  // Fills the revision fields from a picked suggestion (or clears them back
  // to blank when deselecting) — keeps what's shown in the form always
  // matching what's about to be saved, rather than silently submitting
  // whatever was typed before the suggestion was noticed.
  const applySuggestion = (s: SDS | null) => {
    setValue('revision_date', s?.revision_date ?? null);
    setValue('revision_number', s?.revision_number != null ? String(s.revision_number) : '');
    setValue('ghs_pictograms', s?.ghs_pictograms ?? []);
    setExistingLabel(s?.file_name ?? '');
  };

  const resetLocal = () => {
    reset();
    setFile(null);
    setExistingId(null);
    setExistingLabel('');
  };

  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (selection: PendingSdsSelection) =>
      createSds({ container: containerId!, ...selection }),
    onSuccess: (sds) => {
      // .all on every one — a new/attached SDS can change what's shown on
      // the container it's attached to, its chemical's SDS list, and any
      // open SDS search/list.
      qc.invalidateQueries({ queryKey: containerKeys.all });
      qc.invalidateQueries({ queryKey: chemicalKeys.all });
      qc.invalidateQueries({ queryKey: sdsKeys.all });
      resetLocal();
      setOpen(false);
      onUploaded?.(sds);
    },
  });

  const onSubmit = (data: SdsUploadFormValues) => {
    const revisionDate =
      data.revision_date && dayjs.isDayjs(data.revision_date)
        ? data.revision_date.toISOString().split('T')[0]
        : (data.revision_date ?? null);
    const selection: PendingSdsSelection = {
      file: file ?? undefined,
      existingSdsId: existingId ?? undefined,
      revisionDate,
      revisionNumber: data.revision_number,
      ghsPictograms: data.ghs_pictograms,
    };

    if (containerId !== undefined) {
      mutation.mutate(selection);
    } else {
      // Deferred mode — nothing to persist yet, just hand the selection
      // (and a label to show for it) back to the caller.
      onSelect(selection, file ? file.name : existingLabel);
      resetLocal();
      setOpen(false);
    }
  };

  const isDeferred = containerId === undefined;

  // Exactly one of file/existingId — mirrors SDSWriteSerializer.validate()
  // on the backend.
  const canSubmit = !!file !== !!existingId;

  return (
    <Dialog
      fullWidth
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      open={open}
      onClose={() => setOpen(false)}
      disableRestoreFocus
    >
      <DialogTitle>Attach SDS</DialogTitle>
      <DialogContent>
        {mutation.isError && (
          <Alert severity="error" onClose={() => mutation.reset()} sx={{ mb: 2 }}>
            {mutation.error.message}
          </Alert>
        )}
        <Stack spacing={2} sx={{ mt: 2 }}>
          {uniqueSuggestions && uniqueSuggestions.length > 0 && (
            <Box>
              <Typography variant="subtitle2">Use an existing SDS on file?</Typography>
              <List dense>
                {uniqueSuggestions.map((s) => (
                  <ListItem
                    key={s.id}
                    disablePadding
                    secondaryAction={
                      <Tooltip title="Preview this document">
                        <IconButton
                          edge="end"
                          size="small"
                          href={`/sds/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <OpenInNew fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    }
                  >
                    <ListItemButton
                      selected={existingId === s.id}
                      onClick={() => {
                        setExistingId((prev) => {
                          const next = prev === s.id ? null : s.id;
                          applySuggestion(next === null ? null : s);
                          return next;
                        });
                        setFile(null);
                      }}
                    >
                      <ListItemText
                        primary={s.file_name}
                        secondary={[
                          s.revision_date && `Rev. date ${s.revision_date}`,
                          s.revision_number != null && `Rev. # ${s.revision_number}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFile />}
            disabled={!!existingId}
          >
            {file ? file.name : 'Choose a new PDF'}
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setExistingId(null);
              }}
            />
          </Button>
          <RhfDateField
            control={control}
            name="revision_date"
            label="Revision Date"
            disableFuture
          />
          <Controller
            control={control}
            name="revision_number"
            render={({ field: { name, onChange, ...field } }) => (
              <TextField
                {...field}
                label="Revision #"
                type="number"
                onChange={(e) => {
                  onChange(e);
                  clearErrors(name);
                }}
              />
            )}
          />
          <Controller
            control={control}
            name="ghs_pictograms"
            render={({ field }) => (
              <FormControl>
                <InputLabel id="ghs-pictograms">GHS Pictograms</InputLabel>
                <Select
                  {...field}
                  multiple
                  labelId="ghs-pictograms"
                  label="GHS Pictograms"
                  renderValue={(selected) => (
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      {(selected as GHSPictogram[]).map((value) => (
                        <Chip key={value} label={ghsPictogramLabel(value)} size="small" />
                      ))}
                    </Stack>
                  )}
                >
                  {GHS_PICTOGRAMS.map((p) => (
                    <MenuItem key={p.value} value={p.value}>
                      {p.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          type="submit"
          variant="contained"
          loading={mutation.isPending}
          disabled={!canSubmit}
        >
          {isDeferred ? 'Select' : existingId ? 'Attach' : 'Upload'}
        </Button>
        <Button
          onClick={() => {
            resetLocal();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};
