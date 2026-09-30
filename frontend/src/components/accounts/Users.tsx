import { Box, Container, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { type ColDef } from 'ag-grid-community';
import { Search } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { getUsers } from '../../api/users';
import { userKeys } from '../../api/queryKeys';
import { DataTable } from '../shared/DataTable';
import type { User } from '../../types';

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
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Users</Typography>
          <Typography variant="body2" color="text.secondary">
            View and manage user accounts.
          </Typography>
        </Box>
        <TextField
          type="search"
          size="small"
          placeholder="Search users…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ ml: 'auto', minWidth: 260 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
      <Box>
        <DataTable<User>
          rowData={users}
          columnDefs={colDefs}
          isLoading={isPending}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          onRowClicked={(e) => {
            navigate(`${e.data?.id}`, { state: e.data });
          }}
        />
      </Box>
    </Container>
  );
};
