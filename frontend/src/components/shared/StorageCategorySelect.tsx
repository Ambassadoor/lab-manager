import {
  Autocomplete,
  Box,
  TextField,
  Tooltip,
  Typography,
  createFilterOptions,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormClearErrors,
} from 'react-hook-form';
import { getStorageCategories } from '../../api/inventory';
import { chemicalKeys } from '../../api/queryKeys';
import type { StorageCategory } from '../../types';

// Flinn chart order: Organic before Inorganic
const GROUPS = { O: 'Organic', I: 'Inorganic' } as const;
const groupOf = (c: StorageCategory) => GROUPS[c.shorthand[0] as keyof typeof GROUPS] ?? 'Other';

// "O10" -> [0, 10], "I2" -> [1, 2]: group first, then the number naturally
// (so O10 sorts after O9, not after O1)
const sortKey = (c: StorageCategory) => [
  c.shorthand[0] === 'O' ? 0 : c.shorthand[0] === 'I' ? 1 : 2,
  parseInt(c.shorthand.slice(1), 10) || 0,
];

// Search matches the code, the chart's chemical types, and the family index
// — so typing "ketone" finds O4 without knowing the code
const filterOptions = createFilterOptions<StorageCategory>({
  stringify: (c) => [c.shorthand, c.description, ...(c.families ?? [])].join(' '),
});

type StorageCategorySelectProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  rules?: RegisterOptions<TFieldValues, TName>;
  clearErrors: UseFormClearErrors<TFieldValues>;
};

// The one Flinn storage category picker: a searchable Autocomplete grouped
// Organic / Inorganic, each option showing its chemical types, with the
// lab's identification hints (help_text) on hover. Fetches the categories
// itself (a shared, cached query) and stores the selected category's id in
// the form, or '' when cleared.
export function StorageCategorySelect<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label = 'Storage Category',
  rules,
  clearErrors,
}: StorageCategorySelectProps<TFieldValues, TName>) {
  const { data: categories, isPending } = useQuery({
    queryKey: chemicalKeys.storageCategories(),
    queryFn: getStorageCategories,
  });

  const options = useMemo(
    () =>
      [...(categories ?? [])].sort((a, b) => {
        const [ga, na] = sortKey(a);
        const [gb, nb] = sortKey(b);
        return ga - gb || na - nb;
      }),
    [categories]
  );

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState: { error } }) => (
        <Autocomplete
          options={options}
          loading={isPending}
          autoHighlight
          groupBy={groupOf}
          filterOptions={filterOptions}
          getOptionLabel={(c) => `${c.shorthand} — ${c.description}`}
          // Compared as strings — form values may hold the id as a string
          value={options.find((c) => String(c.id) === String(field.value)) ?? null}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_e, c) => {
            field.onChange(c ? c.id : '');
            clearErrors(name);
          }}
          onBlur={field.onBlur}
          renderOption={({ key, ...props }, c) => (
            <Tooltip
              key={key}
              // help_text is the lab's own "how to recognise it" notes —
              // multi-line, so keep its line breaks
              title={
                c.help_text ? (
                  <Box component="span" sx={{ whiteSpace: 'pre-line' }}>
                    {c.help_text}
                  </Box>
                ) : (
                  ''
                )
              }
              placement="right"
              enterDelay={500}
            >
              <li {...props}>
                <Box>
                  <Typography component="span" sx={{ fontWeight: 'bold' }}>
                    {c.shorthand}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {c.description}
                  </Typography>
                </Box>
              </li>
            </Tooltip>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={field.ref}
              label={label}
              error={!!error}
              helperText={error?.message}
            />
          )}
        />
      )}
    />
  );
}
