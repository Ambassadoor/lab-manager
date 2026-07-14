import { Box, Container, Drawer } from '@mui/material';
import { useCallback, useMemo, useState } from 'react';
import { getContainers } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';
import { type ColDef, type GetRowIdParams, type RowSelectionOptions } from 'ag-grid-community';
import { ContainerDetail } from './ContainerDetail';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '../shared/DataTable';
import type { Container as ContainerType } from '../../types';

//TODO: Remove container data logic outside and let parent components pass in values
export const Containers = () => {
  const {
    isPending,
    isError,
    error,
    data: containers,
  } = useQuery({
    queryKey: containerKeys.list(),
    queryFn: getContainers,
  });

  const [open, setOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ContainerType | undefined>(undefined);
  const [colDefs] = useState<ColDef<ContainerType>[]>([
    { field: 'label', headerName: 'ID', filter: true },
    { field: 'name', filter: true },
    { field: 'location.full_path', headerName: 'Location', filter: true },
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

  const getRowId = useCallback((params: GetRowIdParams<ContainerType>) => params.data.label, []);

  return (
    <Box>
      <Container>
        <DataTable<ContainerType>
          rowData={containers}
          columnDefs={colDefs}
          rowSelection={rowSelection}
          pageSize={50}
          getRowId={getRowId}
          isLoading={isPending}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          onRowClicked={(e) => {
            setSelectedRow(e.data);
            setOpen(true);
          }}
        />
      </Container>{' '}
      <Drawer open={open} onClose={() => setOpen((prev) => !prev)} anchor="right">
        <ContainerDetail data={selectedRow} />
      </Drawer>
    </Box>
  );
};
