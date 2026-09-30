import {
  Box,
  CircularProgress,
  Container,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getSdsList } from '../../api/sds';
import { sdsKeys } from '../../api/queryKeys';

// Fully public — no login. One search box covers Chemical name, Product
// name, CAS #, Product #, and Chem-ID (e.g. "CHEM-1143", the barcode
// printed on a container's label) at once, matching SDSFilter.filter_search
// on the backend — someone who's just been exposed to a chemical shouldn't
// have to guess which field to search.
export const SdsSearch = () => {
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

  const { data: results, isPending } = useQuery({
    queryKey: sdsKeys.list(listParams),
    queryFn: () => getSdsList(listParams),
    enabled: !!debouncedSearch,
  });

  const navigate = useNavigate();

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        Search Safety Data Sheets
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Search by chemical name, product name, CAS #, product #, or Chem-ID (e.g. CHEM-1143).
      </Typography>
      <TextField
        type="search"
        fullWidth
        placeholder="Search…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
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
      {isPending && debouncedSearch && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {results && (
        <List sx={{ mt: 1 }}>
          {results.length === 0 && (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              No SDS found for "{debouncedSearch}".
            </Typography>
          )}
          {results.map((sds) => (
            <ListItemButton key={sds.id} divider onClick={() => navigate(`/sds/${sds.id}`)}>
              <ListItemText
                primary={sds.container.name}
                secondary={[
                  sds.container.label,
                  sds.file_name,
                  sds.revision_date && `Rev. date ${sds.revision_date}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Container>
  );
};
