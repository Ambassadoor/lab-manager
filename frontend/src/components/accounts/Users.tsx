import { Box, Container } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { type ColDef } from 'ag-grid-community';
import { useNavigate } from 'react-router-dom';
import { getUsers } from '../../api/users';
import { userKeys } from '../../api/queryKeys';
import { DataTable } from '../shared/DataTable';
import type { User } from '../../types';
import { PageHeader } from '../shared/PageHeader';

// What a phone has room for
const PHONE_COLUMNS = ['first_name', 'last_name', 'role_display'];

// Admin/Lab Manager-only — App.tsx's RequireRole keeps anyone else from
// landing here, matching the backend's own role_at_least(LAB_MANAGER) gate
// on UserView.
export const Users = () => {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const listParams = useMemo(
    () => (debouncedSearch ? { search: debouncedSearch } : {}),
    [debouncedSearch]
  );

  const {
    data: users,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: userKeys.list(listParams),
    queryFn: () => getUsers(listParams),
  });

  const navigate = useNavigate();

  const [colDefs] = useState<ColDef<User>[]>([
    { field: 'username', filter: true },
    { field: 'first_name', headerName: 'First Name' },
    { field: 'last_name', headerName: 'Last Name' },
    { field: 'email', filter: true },
    { field: 'role_display', headerName: 'Role', filter: true },
  ]);

  return (
    <Container maxWidth={false}>
      <PageHeader
        title="Users"
        subtitle="View and manage user accounts."
        search={{ value: searchInput, onChange: setSearchInput, placeholder: 'Search users…' }}
      />
      <Box>
        <DataTable<User>
          rowData={users}
          columnDefs={colDefs}
          isLoading={isPending}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          phoneColumns={PHONE_COLUMNS}
          onRowClicked={(e) => {
            navigate(`${e.data?.id}`, { state: e.data });
          }}
        />
      </Box>
    </Container>
  );
};
