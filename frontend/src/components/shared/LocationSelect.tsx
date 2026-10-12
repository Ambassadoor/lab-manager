import { Autocomplete, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  type UseFormClearErrors,
} from 'react-hook-form';
import { getLocationMenu } from '../../api/inventory';
import { locationKeys } from '../../api/queryKeys';
import { parseBarcode } from './parseBarcode';
import { useScanHandler, useScanner } from '../../scanner/ScannerContext';

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
  // Whether a scanned location label fills this field, wherever focus is.
  // For forms with one location field; the Actions panels handle scans
  // themselves. Without it, a scan opens the scanned location.
  acceptScans?: boolean;
};

// The one location picker for every form: a searchable Autocomplete grouped
// by building + room. Fetches the location menu itself (a shared, cached
// query) and stores just the selected location's id in the form, as a string
// (every caller's form types it that way), or '' when cleared. Scanning a
// location label into it selects that location.
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
  acceptScans = false,
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

  const {
    field,
    fieldState: { error },
  } = useController({ control, name, rules });

  const { notify } = useScanner();
  useScanHandler(
    (target) => {
      // Not a label at all: the app-wide default reports it.
      if (!target) return false;
      if (target.kind === 'container') {
        notify(`${target.label} is a container. Scan a location label to fill ${label}.`, 'info');
        return;
      }
      const option = options.find((o) => o.id === target.id);
      if (!option) {
        const known = menu?.some((l) => l.id === target.id);
        notify(
          known ? `${target.label} can't be chosen here` : `No location ${target.label}`,
          'warning'
        );
        return;
      }
      field.onChange(String(option.id));
      clearErrors(name);
      notify(`${label}: ${option.full_path}`, 'success');
    },
    { enabled: acceptScans }
  );

  return (
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
      // A scanner without the prefix (docs/Barcode-Scanner.md) types the
      // label's {"id":"LOC-12"} into the search box, which matches no
      // option by name (#117). Once the scan is complete, select the
      // location it names. Every barcode is LOC-<id>, so the id is
      // enough to find the option. With the prefix set, the scanner
      // never reaches this field: see acceptScans.
      onInputChange={(event, inputValue, reason) => {
        if (reason !== 'input') return;
        const locationId = /^loc-(\d+)$/i.exec(parseBarcode(inputValue) ?? '')?.[1];
        const option = locationId && options.find((o) => String(o.id) === locationId);
        if (!option) return;
        field.onChange(String(option.id));
        clearErrors(name);
        // Leave the field: that closes the list, so the scanner's
        // trailing Enter can't pick whichever option is highlighted.
        (event?.target as HTMLElement | undefined)?.blur();
      }}
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
  );
}
