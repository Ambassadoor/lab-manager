import { Container } from '@mui/material'
import { AgGridReact } from 'ag-grid-react'
import { useEffect, useState } from 'react'
import { getContainers } from '../../api/inventory'

export const Containers = () => {
    const [containers, setContainers] = useState([])

    const colDefs = [
        { field: 'label', headerName: "ID"},
        { field: 'name'},
        { field: 'location'},
        { field: 'manufacturer'},
        { field: 'quantity'},
        { field: 'product_num', headerName: "Product #"},
        { field: 'is_opened', headerName: "Opened?"}
    ]

    useEffect(() => {
        getContainers().then(setContainers)
    }, [])

    return (
        <Container sx={{height: '80vh'}}>
            <AgGridReact rowData={containers} columnDefs={colDefs} />
        </Container>
    )
}