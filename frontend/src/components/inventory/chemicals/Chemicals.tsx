import { Box, Container, IconButton, Paper, Stack, Typography, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react';
import { getChemicals } from '../../../api/inventory';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { themeMaterial, type ColDef } from 'ag-grid-community';
import { AddBox } from '@mui/icons-material';
import { AddChemical } from './AddChemical';
import { useNavigate } from 'react-router-dom';

export const Chemicals = () => {
  const [open, setOpen] = useState(false);
  const { data: chemicals, isPending } = useQuery({
    queryKey: ['chemicalData'],
    queryFn: getChemicals,
  });

  const navigate = useNavigate();

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

  const [colDefs] = useState<ColDef[]>([
    { field: 'name', headerName: 'Chemical' },
    {
      field: 'molecular_weight',
      headerName: 'Molecular Weight',
      valueFormatter: (p) => (p.value ? new Decimal(p.value).toString() : ''),
    },
    { field: 'cas', headerName: 'CAS #' },
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

  const theme = useTheme();

  const myTheme = themeMaterial.withParams({
    accentColor: theme.palette.info.main,
    backgroundColor: 'transparent',
    foregroundColor: theme.palette.text.primary,
    headerTextColor: theme.palette.text.primary,
    browserColorScheme: theme.palette.mode,
    wrapperBorderRadius: theme.shape.borderRadius,
    textColor: theme.palette.text.primary,
    borderColor: theme.palette.divider,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body2.fontSize,
    checkboxCheckedShapeColor: theme.palette.text.primary,
  });

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
        <Paper sx={{ height: '80dvh' }}>
          <AgGridReact
            theme={myTheme}
            loading={isPending}
            pagination
            paginationPageSize={25}
            paginationPageSizeSelector={[10, 25, 50]}
            rowData={chemicals}
            columnDefs={colDefs}
            autoSizeStrategy={{ type: 'fitCellContents' }}
            onRowClicked={(e) => {
              console.log(e.data);
              navigate(`${e.data.id}`, { state: e.data });
            }}
          />
        </Paper>
      </Box>
    </Container>
  );
};
