import {
  Box,
  IconButton,
  InputAdornment,
  Container,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type CustomCellRendererProps } from 'ag-grid-react';
import { getChemicals } from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { type ColDef } from 'ag-grid-community';
import { AddBox, Search } from '@mui/icons-material';
import { AddChemical } from './AddChemical';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../shared/DataTable';
import type { Chemical } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { hasRoleAtLeast } from '../../shared/roles';

//Table for viewing chemicals
export const Chemicals = () => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const [open, setOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const listParams = useMemo(
    () => (debouncedSearch ? { search: debouncedSearch } : {}),
    [debouncedSearch]
  );

  const {
    data: chemicals,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: chemicalKeys.list(listParams),
    queryFn: () => getChemicals(listParams),
  });

  const navigate = useNavigate();

  //Renders chemical formulas with subscripts
  const formulaCellRenderer = (params: CustomCellRendererProps) => {
    if (typeof params.value !== 'string') return '';
    const split: string[] = params.value.split(/(\d+)/);
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
        {split.map((s, i) => {
          if (s.match(/\d+/))
            return (
              <sub key={i} style={{ maxHeight: 'fit-content', textBoxTrim: 'trim-both' }}>
                {s}
              </sub>
            );
          else
            return (
              <p
                key={i}
                style={{ height: 'unset', marginTop: 0, marginBottom: 7, textBoxTrim: 'trim-both' }}
              >
                {s}
              </p>
            );
        })}
      </Box>
    );
  };

  const [colDefs] = useState<ColDef<Chemical>[]>([
    { field: 'name', headerName: 'Chemical', filter: true },
    {
      field: 'molecular_weight',
      headerName: 'Molecular Weight',
      valueFormatter: (p) => (p.value ? new Decimal(p.value).toString() : ''),
    },
    { field: 'cas', headerName: 'CAS #', filter: true },
    {
      field: 'formula',
      headerName: 'Chemical Formula',
      cellRenderer: formulaCellRenderer,
      autoHeight: true,
      cellStyle: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
    },
    { field: 'storage_category.shorthand', headerName: 'Storage Category' },
  ]);

  return (
    <Container maxWidth={false}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box>
          <Stack direction={'row'} spacing={2}>
            <Typography variant="h4">Chemicals</Typography>
            {canEdit && (
              <Tooltip title="Add chemical">
                <IconButton
                  onClick={() => {
                    setOpen(true);
                  }}
                >
                  <AddBox />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Browse the chemical catalog.
          </Typography>
        </Box>
        <TextField
          type="search"
          size="small"
          placeholder="Search chemicals…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ ml: 'auto', minWidth: 260 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
      <AddChemical open={open} setOpen={setOpen} />
      <Box>
        <DataTable<Chemical>
          rowData={chemicals}
          columnDefs={colDefs}
          isLoading={isPending}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          onRowClicked={(e) => {
            navigate(`${e.data?.id}`, { state: e.data });
          }}
        />
      </Box>
    </Container>
  );
};
