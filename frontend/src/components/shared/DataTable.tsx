import { Alert, Paper, Typography, useTheme } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import {
  themeMaterial,
  type CellValueChangedEvent,
  type ColDef,
  type GetRowIdParams,
  type RowClickedEvent,
  type RowSelectionOptions,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';

const NoRowsOverlay = () => <Typography color="text.secondary">No rows to display</Typography>;

type ErrorOverlayProps = { errorMessage?: string };

const ErrorOverlay = ({ errorMessage }: ErrorOverlayProps) => (
  <Alert severity="error" sx={{ justifyContent: 'center' }}>
    {errorMessage ?? 'There was an error loading the table.'}
  </Alert>
);

export type DataTableProps<TData> = {
  rowData: TData[] | undefined;
  columnDefs: ColDef<TData>[];
  getRowId?: (params: GetRowIdParams<TData>) => string;
  rowSelection?: RowSelectionOptions;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRowClicked?: (e: RowClickedEvent<TData>) => void;
  // Seam for inline editing — not wired to a mutation yet.
  onCellValueChanged?: (e: CellValueChangedEvent<TData>) => void;
  height?: string | number;
  pageSize?: number;
  pageSizeOptions?: number[];
};

export function DataTable<TData>({
  rowData,
  columnDefs,
  getRowId,
  rowSelection,
  isLoading,
  isError,
  errorMessage,
  onRowClicked,
  onCellValueChanged,
  height = '80dvh',
  pageSize = 25,
  pageSizeOptions = [10, 25, 50],
}: DataTableProps<TData>) {
  const theme = useTheme();
  const { mode } = useColorScheme();

  const myTheme = themeMaterial.withParams({
    accentColor: theme.palette.info.main,
    foregroundColor: theme.palette.text.primary,
    headerTextColor: theme.palette.text.primary,
    browserColorScheme: theme.palette.mode,
    wrapperBorderRadius: theme.shape.borderRadius,
    textColor: theme.palette.text.primary,
    borderColor: theme.palette.divider,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.body2.fontSize,
    checkboxCheckedShapeColor: theme.palette.text.primary,
    backgroundColor: 'transparent',
    menuBackgroundColor: mode === 'dark' ? 'rgb(39, 39, 39)' : 'rgb(255, 255, 255)',
    pickerListBackgroundColor: mode === 'dark' ? 'rgb(39, 39, 39)' : 'rgb(255, 255, 255)',
    // Row-selection checkbox styling only matters once selection is on.
    ...(rowSelection && {
      checkboxCheckedBackgroundColor: theme.palette.info.main,
      checkboxIndeterminateBackgroundColor: 'transparent',
      checkboxIndeterminateShapeColor: theme.palette.text.primary,
      checkboxIndeterminateBorderColor: theme.palette.info.main,
    }),
  });

  return (
    <Paper elevation={4} sx={{ height }}>
      <AgGridReact<TData>
        theme={myTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        getRowId={getRowId}
        rowSelection={rowSelection}
        loading={isLoading}
        pagination
        paginationPageSize={pageSize}
        paginationPageSizeSelector={pageSizeOptions}
        autoSizeStrategy={{ type: 'fitCellContents' }}
        noRowsOverlayComponent={NoRowsOverlay}
        activeOverlay={isError ? ErrorOverlay : undefined}
        activeOverlayParams={isError ? ({ errorMessage } satisfies ErrorOverlayProps) : undefined}
        onRowClicked={onRowClicked}
        onCellValueChanged={onCellValueChanged}
      />
    </Paper>
  );
}
