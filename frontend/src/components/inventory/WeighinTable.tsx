import { useQuery } from '@tanstack/react-query';
import { getContainerWeighIns } from '../../api/inventory';
import { containerKeys } from '../../api/queryKeys';
import { useCallback, useState } from 'react';
import type { ColDef, GetRowIdParams } from 'ag-grid-community';
import Decimal from 'decimal.js';
import { DataTable } from '../shared/DataTable';

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

  return (
    <DataTable
      rowData={weighInEvents}
      columnDefs={colDefs}
      getRowId={getRowId}
      isLoading={isPending}
      height="200px"
      pageSize={5}
      pageSizeOptions={[5, 10, 15]}
      elevation={8}
    />
  );
};
