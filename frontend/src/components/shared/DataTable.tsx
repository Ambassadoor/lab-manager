import { Alert, Box, Typography, useTheme } from '@mui/material';
import { getOverlayAlpha, useColorScheme } from '@mui/material/styles';
import {
  createPart,
  inputStyleBordered,
  themeMaterial,
  type CellDoubleClickedEvent,
  type CellValueChangedEvent,
  type ColDef,
  type FirstDataRenderedEvent,
  type GetRowIdParams,
  type RowClickedEvent,
  type RowSelectionOptions,
} from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useState } from 'react';

const NoRowsOverlay = () => <Typography color="text.secondary">No rows to display</Typography>;

type ErrorOverlayProps = { errorMessage?: string };

const ErrorOverlay = ({ errorMessage }: ErrorOverlayProps) => (
  <Alert severity="error" sx={{ justifyContent: 'center' }}>
    {errorMessage ?? 'There was an error loading the table.'}
  </Alert>
);

// themeMaterial's own styleMaterial part hardcodes the editing cell's
// height to `row-height + spacing * 3` and its padding to `spacing`, in raw
// CSS with !important — not themeable tokens, so no combination of
// inputHeight/cellEditingBorder/etc. params can override them. Overriding
// the CSS directly here, composed as part of the same theme object,
// guarantees correct injection order versus a separate global stylesheet
// (which could load/apply before or after ag-grid's own dynamically
// injected theme CSS).
const compactCellEditing = createPart({
  feature: 'compactCellEditing',
  css: '.ag-cell.ag-cell-inline-editing { height: var(--ag-row-height) !important; padding: 0 !important; }',
});

export type DataTableProps<TData> = {
  rowData: TData[] | undefined;
  columnDefs: ColDef<TData>[];
  getRowId?: (params: GetRowIdParams<TData>) => string;
  rowSelection?: RowSelectionOptions;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRowClicked?: (e: RowClickedEvent<TData>) => void;
  onCellDoubleClicked?: (e: CellDoubleClickedEvent<TData>) => void;
  onCellValueChanged?: (e: CellValueChangedEvent<TData>) => void;
  // Lets a single click start editing an editable cell instead of just
  // selecting it (ag-grid's default). Has no effect on non-editable cells.
  singleClickEdit?: boolean;
  height?: string | number;
  pageSize?: number;
  pageSizeOptions?: number[];
  // Matches MUI Paper's elevation scale (0-24) — this component imitates a
  // Paper's shadow + elevation-shaded background rather than wrapping an
  // actual <Paper>, since the grid's own internal surfaces (rows, menus,
  // cell editor inputs) need that same color directly, not just the outer
  // wrapper.
  elevation?: number;
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
  onCellDoubleClicked,
  onCellValueChanged,
  singleClickEdit,
  height = '80dvh',
  pageSize = 25,
  pageSizeOptions = [10, 25, 50],
  elevation = 4,
}: DataTableProps<TData>) {
  const theme = useTheme();
  const { mode } = useColorScheme();
  const [contentWidth, setContentWidth] = useState<number>();

  // fitCellContents sizes each column to its own content, but the grid's
  // wrapper div still stretches to fill its flex/grid parent by default —
  // this measures the columns' actual total width once they're sized, so
  // the wrapper (and its shadow) can shrink to match instead of leaving a
  // blank stretch of grid past the last column.
  const onFirstDataRendered = (params: FirstDataRenderedEvent<TData>) => {
    const totalWidth = params.api
      .getColumnState()
      .reduce((sum, col) => sum + (col.hide ? 0 : (col.width ?? 0)), 0);
    setContentWidth(totalWidth);
  };

  // MUI's dark-mode Paper elevation shading is `linear-gradient(c, c)` — the
  // same color at both stops, i.e. just a flat translucent white layer, not
  // a real gradient. That means it can be flattened exactly (not
  // approximated) via CSS color-mix, using MUI's own alpha formula rather
  // than a hand-picked RGB literal. Light mode has no elevation shading at
  // all — Paper's background stays flat regardless of elevation.
  const elevatedBackground =
    mode === 'dark'
      ? `color-mix(in srgb, #fff ${getOverlayAlpha(elevation) * 100}%, ${theme.palette.background.paper})`
      : theme.palette.background.paper;

  const myTheme = themeMaterial
    // Material's default cell editor mimics the classic underlined
    // Material Design text field. Swap to the bordered input style
    // themeQuartz/Alpine/Balham use instead for its border/background
    // treatment.
    .withPart(inputStyleBordered)
    .withPart(compactCellEditing)
    .withParams({
      accentColor: theme.palette.info.main,
      foregroundColor: theme.palette.text.primary,
      headerTextColor: theme.palette.text.primary,
      browserColorScheme: theme.palette.mode,
      wrapperBorderRadius: theme.shape.borderRadius,
      textColor: theme.palette.text.primary,
      borderColor: theme.palette.divider,
      fontFamily: theme.typography.fontFamily,
      fontSize: theme.typography.body2.fontSize,
      backgroundColor: elevatedBackground,
      // Material's own themeMaterialParams() hard-codes inputHeight to
      // max(iconSize, fontSize) + spacing * 3, taller than rowHeight's own
      // formula (spacing * 3.75 * rowVerticalPaddingScale, but against
      // cellFontSize instead of fontSize) — the mismatch is what forces the
      // cell to grow during editing, independent of border/shadow styling.
      // Locking it to rowHeight's own (already-computed) value fixes that
      // regardless of how rowHeight itself is configured.
      inputHeight: { ref: 'rowHeight' },
    });

  return (
    <Box
      sx={{
        height,
        width: contentWidth ? `${contentWidth}px` : '100%',
        maxWidth: '100%',
        mx: 'auto',
        boxShadow: theme.shadows[elevation],
        // Matches wrapperBorderRadius above, so the shadow follows the same
        // rounded shape ag-grid's own wrapper already renders.
        borderRadius: `${theme.shape.borderRadius}px`,
      }}
    >
      <AgGridReact<TData>
        theme={myTheme}
        rowData={rowData}
        columnDefs={columnDefs}
        getRowId={getRowId}
        rowSelection={rowSelection}
        singleClickEdit={singleClickEdit}
        // Otherwise a cell stays "editing" (just visually unfocused) when
        // the user clicks entirely outside the grid, instead of committing.
        stopEditingWhenCellsLoseFocus
        loading={isLoading}
        pagination
        paginationPageSize={pageSize}
        paginationPageSizeSelector={pageSizeOptions}
        autoSizeStrategy={{ type: 'fitCellContents' }}
        onFirstDataRendered={onFirstDataRendered}
        noRowsOverlayComponent={NoRowsOverlay}
        activeOverlay={isError ? ErrorOverlay : undefined}
        activeOverlayParams={isError ? ({ errorMessage } satisfies ErrorOverlayProps) : undefined}
        onRowClicked={onRowClicked}
        onCellDoubleClicked={onCellDoubleClicked}
        onCellValueChanged={onCellValueChanged}
      />
    </Box>
  );
}
