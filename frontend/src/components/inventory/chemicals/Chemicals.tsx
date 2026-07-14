import { Box, IconButton, Container, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type CustomCellRendererProps } from 'ag-grid-react';
import { getChemicals } from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { type ColDef } from 'ag-grid-community';
import { AddBox } from '@mui/icons-material';
import { AddChemical } from './AddChemical';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../shared/DataTable';
import type { Chemical } from '../../../types';

//Table for viewing chemicals
export const Chemicals = () => {
  const [open, setOpen] = useState(false);
  const {
    data: chemicals,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: chemicalKeys.list(),
    queryFn: getChemicals,
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
    <Container>
      <Stack direction={'row'}>
        <Typography variant="h4">Chemicals</Typography>
        <IconButton
          onClick={() => {
            setOpen(true);
          }}
        >
          <AddBox />
        </IconButton>
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
