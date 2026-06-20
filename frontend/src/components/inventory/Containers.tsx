import { Container, useTheme } from '@mui/material'
import { AgGridReact } from 'ag-grid-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getContainers } from '../../api/inventory'
import { themeMaterial } from 'ag-grid-community'

export const Containers = () => {
    const [containers, setContainers] = useState([])

    const [colDefs, setColDefs] = useState([
        { field: 'label', headerName: "ID"},
        { field: 'name'},
        { field: 'location', filter: true},
        { field: 'manufacturer'},
        { field: 'quantity'},
        { field: 'product_num', headerName: "Product #"},
        { field: 'is_opened', headerName: "Opened?"}
    ])

    const rowSelection = useMemo(() => {
        return {
            mode: 'multiRow'
        }
    }, [])

    const getRowId = useCallback((params) => params.data.label, [],) 

    const pagination = true;
    const paginationPageSize = 50;
    const paginationPageSizeSelector = [10, 25, 50]
    useEffect(() => {
        getContainers().then(setContainers)
    }, [])

    const theme = useTheme()
    const myTheme = themeMaterial.withParams({
        accentColor: theme.palette.info.main,
        backgroundColor: theme.palette.background.paper,
        foregroundColor: theme.palette.text.primary,
        headerTextColor: theme.palette.text.primary,
        browserColorScheme: theme.palette.mode,
        wrapperBorderRadius: theme.shape.borderRadius,
        textColor: theme.palette.text.primary,
        borderColor: theme.palette.divider,
        fontFamily: theme.typography.fontFamily,
        fontSize: theme.typography.body2.fontSize
    })

    return (
        <Container sx={{height: '80vh'}}>
            <AgGridReact
                theme={myTheme}
                rowData={containers} 
                columnDefs={colDefs} 
                rowSelection={rowSelection} 
                pagination={pagination}
                paginationPageSize={paginationPageSize}
                paginationPageSizeSelector={paginationPageSizeSelector}
                getRowId={getRowId}
                />
        </Container>
    )
}