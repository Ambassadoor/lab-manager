import { useQuery } from '@tanstack/react-query';
import { getContainerWeighIns } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';
import { useCallback, useState } from 'react';
import type { ColDef, GetRowIdParams } from 'ag-grid-community';
import Decimal from 'decimal.js';
import { DataTable } from '../shared/DataTable';
import { Typography } from '@mui/material';

type WeighInTableProps = {
  slug: string;
};

export const WeighInTable = ({ slug }: WeighInTableProps) => {
  const { isPending, data: weighInEvents } = useQuery({
    queryKey: containerKeys.weighIns(slug),
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

  // A whole empty grid (header, "No rows", "Page 0 of 0") is a lot of chrome
  // for nothing — one line says the same.
  if (weighInEvents?.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No weigh-ins recorded yet.
      </Typography>
    );
  }

  return (
    <DataTable
      rowData={weighInEvents}
      columnDefs={colDefs}
      getRowId={getRowId}
      isLoading={isPending}
      // Fits a full page of 5 rows plus header and pagination without scrolling
      height="340px"
      pageSize={5}
      pageSizeOptions={[5, 10, 15]}
      // Flush with ContainerDetail's full-page card (elevation 4) rather
      // than floating above it
      elevation={4}
      flat
      fillWidth
    />
  );
};
