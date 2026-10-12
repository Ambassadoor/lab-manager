import { AddBox } from '@mui/icons-material';
import {
  Box,
  Container,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { ColDef } from 'ag-grid-community';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getContainers, getLocationContainers } from '../../../api/inventory';
import { locationKeys } from '../../../api/queryKeys';
import { useAuth } from '../../../context/AuthContext';
import type { Container as ContainerType } from '../../../types';
import { DataTable } from '../../shared/DataTable';
import { PageHeader } from '../../shared/PageHeader';
import { hasRoleAtLeast } from '../../shared/roles';
import { ContainerDetail } from '../ContainerDetail';
import { LocationTree } from './LocationTree';

// What a phone has room for
const PHONE_COLUMNS = ['label', 'name'];

// Component for viewing/editing locations and their assigned containers
export const Locations = () => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const [open, setOpen] = useState(false);
  // Selection lives in the URL (?location=<id>) rather than local state, so
  // a link to a specific location's container list can be bookmarked/shared
  // and survives back/forward navigation.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedLocation = searchParams.get('location') ?? '';
  const setSelectedLocation = (id: string) => {
    setSearchParams(id ? { location: id } : {});
    // The previewed container likely isn't in the new location's list
    setPreviewSlug(null);
  };
  // Slug rather than the row object, so the preview re-derives from the
  // latest list data after a refetch (e.g. after editing in the panel).
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  // Tree (360px) + grid + a 25dvw preview only fit comfortably from xl up;
  // below that the preview is dropped so the tree and grid keep the room
  // (double-click still opens a container's full page).
  const showPreview = useMediaQuery((theme) => theme.breakpoints.up('xl'));
  //Get's all containers for selected location and any child locations
  const { isPending, data: locationContainers } = useQuery({
    queryKey: locationKeys.containers(selectedLocation),
    queryFn: async () => {
      if (selectedLocation.length > 0) {
        const location = await getLocationContainers(selectedLocation);
        return location.containers;
      } else {
        return await getContainers();
      }
    },
  });

  const previewContainer = previewSlug
    ? locationContainers?.find((c) => c.slug === previewSlug)
    : undefined;

  const [colDefs] = useState<ColDef[]>([
    { field: 'label', headerName: 'ID' },
    { field: 'name' },
    { field: 'manufacturer' },
    { field: 'quantity' },
    { field: 'product_num', headerName: 'Product #' },
  ]);

  const navigate = useNavigate();

  return (
    <Container maxWidth={false}>
      <PageHeader
        title="Locations"
        subtitle="Browse locations and the containers stored in them."
        titleActions={
          canEdit && (
            <Tooltip title="Add root location">
              <IconButton onClick={() => setOpen(true)}>
                <AddBox />
              </IconButton>
            </Tooltip>
          )
        }
      />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <LocationTree
          selectedLocation={selectedLocation}
          onSelect={setSelectedLocation}
          onDeleted={(deletedId) =>
            // Reads the latest params at apply time, so this can't clear a
            // different location selected while the delete was in flight
            setSearchParams((prev) => {
              if (prev.get('location') !== deletedId) return prev;
              const next = new URLSearchParams(prev);
              next.delete('location');
              return next;
            })
          }
          addRootOpen={open}
          setAddRootOpen={setOpen}
        />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <DataTable<ContainerType>
            align="start"
            isLoading={isPending}
            rowData={locationContainers}
            columnDefs={colDefs}
            height="75dvh"
            onRowClicked={(e) => {
              if (showPreview && e.data) setPreviewSlug(e.data.slug);
            }}
            phoneColumns={PHONE_COLUMNS}
            onRowOpen={(row) => {
              navigate(`/inventory/containers/${row.slug}`, { state: row });
            }}
          />
        </Box>
        {showPreview && (
          <Box sx={{ flexShrink: 0, width: '25dvw' }}>
            {previewContainer ? (
              // key: remount per container so an in-progress edit on one
              // doesn't carry over to the next
              <ContainerDetail
                key={previewContainer.slug}
                data={previewContainer}
                elevation={4}
                onClose={() => setPreviewSlug(null)}
              />
            ) : (
              <Paper
                elevation={4}
                sx={{
                  height: '75dvh',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 3,
                }}
              >
                <Typography color="text.secondary" align="center">
                  Select a container to preview it here. Double-click to open its full page.
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Stack>
    </Container>
  );
};
