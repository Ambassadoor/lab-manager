import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { addChemical } from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ChemicalDefaults } from '../../../types';
import { ChemicalFields } from './ChemicalFields';

type AddChemicalProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

//Modal for in page addition of new chemicals
export const AddChemical = ({ open, setOpen }: AddChemicalProps) => {
  const {
    handleSubmit,
    control,
    reset,
    clearErrors,
    formState: { isValidating },
  } = useForm<ChemicalDefaults>({
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      name: '',
      molecular_weight: '',
      cas: '',
      formula: '',
      storage_category: '',
    },
  });

  const qc = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: addChemical,
    onSuccess: (chemical) => {
      qc.invalidateQueries({
        queryKey: chemicalKeys.list(),
      });
      reset();
      setOpen(false);
      navigate(`/inventory/chemicals/${chemical.id}`);
    },
  });

  const onSubmit = (data: ChemicalDefaults) => {
    mutation.mutate(data);
  };

  return (
    <Dialog
      fullWidth
      component="form"
      onSubmit={handleSubmit(onSubmit)}
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      disableRestoreFocus
    >
      <DialogTitle>Add Chemical</DialogTitle>
      <DialogContent>
        {mutation.isError && (
          <Alert
            severity="error"
            onClose={() => {
              mutation.reset();
            }}
            sx={{ mb: 2 }}
          >
            {mutation.error.message}
          </Alert>
        )}
        {/* pt, not mt — DialogContent clips the first field's floating label */}
        <Box sx={{ pt: 1 }}>
          <ChemicalFields control={control} clearErrors={clearErrors} />
        </Box>
      </DialogContent>
      {/* Same order as the detail pages' FormActions: Cancel, then the
          primary action */}
      <DialogActions>
        <Button
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={mutation.isPending || isValidating}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};
