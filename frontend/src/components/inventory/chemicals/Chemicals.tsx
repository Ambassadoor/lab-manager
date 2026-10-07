import { Box, IconButton, Container, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type CustomCellRendererProps } from 'ag-grid-react';
import { getChemicals } from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { type ColDef } from 'ag-grid-community';
import { AddBox } from '@mui/icons-material';
import { AddChemical } from './AddChemical';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../shared/DataTable';
import type { Chemical } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { hasRoleAtLeast } from '../../shared/roles';
import { PageHeader } from '../../shared/PageHeader';

// What a phone has room for
const PHONE_COLUMNS = ['name', 'cas'];

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
      <PageHeader
        title="Chemicals"
        subtitle="Browse the chemical catalog."
        titleActions={
          <>
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
          </>
        }
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search chemicals…' }}
      />
      <AddChemical open={open} setOpen={setOpen} />
      <Box>
        <DataTable<Chemical>
          rowData={chemicals}
          columnDefs={colDefs}
          isLoading={isPending}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          phoneColumns={PHONE_COLUMNS}
          onRowClicked={(e) => {
            navigate(`${e.data?.id}`, { state: e.data });
          }}
        />
      </Box>
    </Container>
  );
};
