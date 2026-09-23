import { Autocomplete, TextField } from '@mui/material';
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
import { getLocationMenu } from '../../api/inventory';
import { locationKeys } from '../../api/queryKeys';

type LocationOption = { id: number; full_path: string; group: string };

// "McFarland 404 Fire Cabinet" -> "McFarland 404": everything up to the
// first space after a word containing a digit (the room number). A path
// with no such word is its own group.
const groupOf = (fullPath: string) => fullPath.split(/(?<=\d\S*)\s/)[0];

type LocationSelectProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  name: TName;
  label: string;
  rules?: RegisterOptions<TFieldValues, TName>;
  clearErrors: UseFormClearErrors<TFieldValues>;
  // Ids to leave out, e.g. a location itself when picking its own parent
  excludeIds?: (string | number)[];
  fullWidth?: boolean;
  // Shown when nothing is selected, e.g. what an empty value means
  placeholder?: string;
};

// The one location picker for every form: a searchable Autocomplete grouped
// by building + room. Fetches the location menu itself (a shared, cached
// query) and stores just the selected location's id in the form, as a string
// (every caller's form types it that way), or '' when cleared.
export function LocationSelect<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  rules,
  clearErrors,
  excludeIds = [],
  fullWidth,
  placeholder,
}: LocationSelectProps<TFieldValues, TName>) {
  const { data: menu, isPending } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
  });

  const excluded = excludeIds.map(String).join(',');
  const options = useMemo<LocationOption[]>(() => {
    const skip = new Set(excluded ? excluded.split(',') : []);
    return (
      (menu ?? [])
        .filter((l) => !skip.has(String(l.id)))
        .map((l) => ({ id: l.id, full_path: l.full_path, group: groupOf(l.full_path) }))
        // groupBy only groups adjacent options, so sort by group first
        .sort((a, b) => a.group.localeCompare(b.group) || a.full_path.localeCompare(b.full_path))
    );
  }, [menu, excluded]);

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState: { error } }) => (
        <Autocomplete
          options={options}
          loading={isPending}
          fullWidth={fullWidth}
          autoHighlight
          groupBy={(o) => o.group}
          getOptionLabel={(o) => o.full_path}
          // Compared as strings — some forms hold the id as a string
          value={options.find((o) => String(o.id) === String(field.value)) ?? null}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          onChange={(_e, option) => {
            field.onChange(option ? String(option.id) : '');
            clearErrors(name);
          }}
          onBlur={field.onBlur}
          // Under a group heading the group's own prefix is redundant, so
          // show just the rest ("Fire Cabinet"); the room itself keeps its
          // full name. Search still matches the full path.
          renderOption={({ key, ...props }, o) => (
            <li key={key} {...props}>
              {o.full_path.slice(o.group.length).trim() || o.full_path}
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={field.ref}
              label={label}
              placeholder={placeholder}
              // Merged, not replaced — params.slotProps carries Autocomplete's
              // own input wiring. The label stays shrunk when there's a
              // placeholder so the placeholder is visible while empty.
              slotProps={{
                ...params.slotProps,
                inputLabel: {
                  ...params.slotProps.inputLabel,
                  shrink: placeholder ? true : undefined,
                },
              }}
              error={!!error}
              helperText={error?.message}
            />
          )}
        />
      )}
    />
  );
}
