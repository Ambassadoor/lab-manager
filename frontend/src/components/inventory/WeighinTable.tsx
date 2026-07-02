import { useQuery } from '@tanstack/react-query';
import { getContainerWeighIns } from '../../api/inventory';
import { useCallback, useMemo, useState } from 'react';
import {
  themeMaterial,
  type ColDef,
  type GetRowIdParams,
  type RowSelectionOptions,
} from 'ag-grid-community';
import { Container, Paper, Typography, useTheme } from '@mui/material';
import { AgGridReact } from 'ag-grid-react';
import Decimal from 'decimal.js';

type WeighInTableProps = {
  slug: string;
};

export const WeighInTable = ({ slug }: WeighInTableProps) => {
  const { isPending, data: weighInEvents } = useQuery({
    queryKey: ['weighInData'],
    queryFn: () => getContainerWeighIns(slug),
  });
  const [colDefs] = useState<ColDef[]>([
    {
      field: 'weight',
      valueFormatter: (params) => {
        return new Decimal(params.value).toString() + ' g';
      },
    },
    {
      field: 'recorded_at',
      headerName: 'Recorded At',
      valueFormatter: (params) => {
        return new Date(params.value).toLocaleDateString('en-us', {
          year: '2-digit',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
        });
      },
    },
  ]);

  const getRowId = useCallback((params: GetRowIdParams) => String(params.data.id), []);

  const pagination = true;
  const paginationPageSize = 5;
  const paginationPageSizeSelector = [5, 10, 15];

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
  });
  return (
    <Container sx={{ height: '200px' }}>
      <Paper elevation={8} sx={{ height: '200px' }}>
        <AgGridReact
          theme={myTheme}
          rowData={weighInEvents}
          autoSizeStrategy={{ type: 'fitCellContents' }}
          columnDefs={colDefs}
          pagination={pagination}
          paginationPageSize={paginationPageSize}
          paginationPageSizeSelector={paginationPageSizeSelector}
          paginationAutoPageSize={false}
          getRowId={getRowId}
          loading={isPending}
        />
      </Paper>
    </Container>
  );
};
