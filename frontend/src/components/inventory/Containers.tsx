import { Container } from '@mui/material'
import { AgGridReact } from 'ag-grid-react'
import { useEffect, useState } from 'react'
import { getContainers } from '../../api/inventory'

export const Containers = () => {
    const [containers, setContainers] = useState([])

    const colDefs = [
        { field: 'label'},
        { field: 'name'},
        { field: 'location'},
        { field: 'manufacturer'},
        { field: 'quantity'},
        { field: 'product_num'},
        { field: 'is_opened'}
    ]

    useEffect(() => {
        getContainers().then(setContainers)
    }, [])

    return (
        <Container sx={{height: '100vh'}}>
            <AgGridReact rowData={containers} columnDefs={colDefs} />
        </Container>
    )
}