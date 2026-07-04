import { Alert, Box, Container, Drawer, Paper, useTheme } from '@mui/material';
import { AgGridReact } from 'ag-grid-react';
import { useCallback, useMemo, useState } from 'react';
import { getContainers } from '../../api/inventory';
import {
  type ColDef,
  themeMaterial,
  type GetRowIdParams,
  type RowSelectionOptions,
} from 'ag-grid-community';
import { ContainerDetail } from './ContainerDetail';
import { useQuery } from '@tanstack/react-query';

//TODO: Remove container data logic outside and let parent components pass in values
export const Containers = () => {
  const {
    isPending,
    error,
    data: containers,
  } = useQuery({
    queryKey: ['containerData'],
    queryFn: getContainers,
  });

  const [open, setOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState();
  const [colDefs] = useState<ColDef[]>([
    { field: 'label', headerName: 'ID' },
    { field: 'name' },
    { field: 'location', filter: true },
    { field: 'manufacturer' },
    { field: 'quantity' },
    { field: 'product_num', headerName: 'Product #' },
    { field: 'is_opened', headerName: 'Opened?' },
  ]);

  const rowSelection = useMemo<RowSelectionOptions>(() => {
    return {
      mode: 'multiRow',
    };
  }, []);

  const getRowId = useCallback((params: GetRowIdParams) => params.data.label, []);

  const pagination = true;
  const paginationPageSize = 50;
  const paginationPageSizeSelector = [10, 25, 50];

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
    <Box>
      <Container>
        {error && <Alert severity="error">There was an error loading the table.</Alert>}
        <Paper elevation={4} sx={{ height: '80dvh' }}>
          <AgGridReact
            theme={myTheme}
            rowData={containers}
            columnDefs={colDefs}
            rowSelection={rowSelection}
            pagination={pagination}
            paginationPageSize={paginationPageSize}
            paginationPageSizeSelector={paginationPageSizeSelector}
            autoSizeStrategy={{ type: 'fitCellContents' }}
            getRowId={getRowId}
            loading={isPending}
            onRowClicked={(e) => {
              setSelectedRow(e.data);
              setOpen(true);
            }}
          />
        </Paper>
      </Container>{' '}
      <Drawer open={open} onClose={() => setOpen((prev) => !prev)} anchor="right">
        <ContainerDetail data={selectedRow} />
      </Drawer>
    </Box>
  );
};
