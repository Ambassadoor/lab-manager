import {
  AcUnit,
  AddBox,
  Business,
  BusinessTwoTone,
  Delete,
  DoorSliding,
  Edit,
  ExpandLess,
  ExpandMore,
  Inventory,
  Kitchen,
  MeetingRoom,
  MoreVert,
  Pallet,
  Print,
  Shelves,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  useMediaQuery,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { deleteLocation, getLocationMenu, getLocations } from '../../../api/inventory';
import { locationKeys, printerKeys } from '../../../api/queryKeys';
import { useAuth } from '../../../context/AuthContext';
import type { Location } from '../../../types';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { PrintResultSnackbar } from '../../shared/PrintResultSnackbar';
import { printLocationLabels, type LocationLabelTarget } from '../../shared/printTemplates';
import { hasRoleAtLeast } from '../../shared/roles';
import { useConfirmDialog } from '../../shared/useConfirmDialog';
import { AddLocation } from './AddLocation';
import { EditLocation } from './EditLocation';

type LocationRowProps = {
  location: Location;
  parent?: Location;
  // Names from the root down to this location, for its printed label
  path: string[];
  // Nesting level, used to indent the row
  depth?: number;
  selectedLocation: string;
  setSelectedLocation: (id: string) => void;
  // Stockroom+ — shows the row actions menu
  canEdit: boolean;
  onRequestDelete: (target: { id: string; name: string }) => void;
  // Lifted to LocationTree (see its own comment) —
  // every row in this recursively-rendered tree calls the same one, so
  // printing two rows in a row doesn't spawn two uncoordinated mutations
  // or snackbars.
  onPrint: (targets: LocationLabelTarget[]) => void;
};

const iconMap = new Map([
  ['Business', <Business />],
  ['Inventory', <Inventory />],
  ['Pallet', <Pallet />],
  ['Kitchen', <Kitchen />],
  ['AcUnit', <AcUnit />],
  ['Shelves', <Shelves />],
  ['DoorSliding', <DoorSliding />],
  ['MeetingRoom', <MeetingRoom />],
  ['BusinessTwoTone', <BusinessTwoTone />],
]);

const containsLocation = (location: Location, id: string): boolean =>
  String(location.id) === id || location.children.some((c) => containsLocation(c, id));

//Self referencing location component to allow for tiered location listing
const LocationRow = ({
  location,
  parent,
  path,
  depth = 0,
  selectedLocation,
  setSelectedLocation,
  canEdit,
  onRequestDelete,
  onPrint,
}: LocationRowProps) => {
  // Start expanded when the selection (e.g. from a bookmarked ?location= link)
  // is somewhere below this row, so the selected row is actually visible.
  const [expanded, setExpanded] = useState(() =>
    location.children.some((c) => containsLocation(c, selectedLocation))
  );
  const [open, setOpen] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const hasChildren = location.children.length > 0;

  // Row actions live inside the ListItemButton, so they must not also
  // trigger its select handler or its ripple.
  const rowAction = (fn: () => void) => ({
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    },
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  });

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Close the menu before running the action so focus returns to the row
  // and the dialog it opens isn't stacked on top of the menu.
  const menuAction = (fn: () => void) => () => {
    setMenuAnchor(null);
    fn();
  };

  return (
    <>
      <AddLocation
        id={String(location.id)}
        open={open}
        setOpen={setOpen}
        onCreated={(created, print) => {
          // Show the new children right away instead of leaving them
          // hidden under a collapsed row
          setExpanded(true);
          if (print) onPrint(created.map((c) => ({ id: c.id, path: [...path, c.name] })));
        }}
      />
      <EditLocation location={location} parent={parent} open={openEdit} setOpen={setOpenEdit} />
      <ListItemButton
        selected={selectedLocation === String(location.id)}
        onClick={() => setSelectedLocation(String(location.id))}
        sx={{ pl: { xs: 1 + depth * 1.5, sm: 2 + depth * 2 } }}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>
          {location.type.icon && iconMap.get(location.type.icon)}
        </ListItemIcon>
        <ListItemText primary={location.name} />
        {/* Location add/edit/print/delete are all Stockroom+, so one
            role check covers the whole menu. */}
        {canEdit && (
          <IconButton
            size="small"
            aria-label={`Actions for ${location.name}`}
            aria-haspopup="menu"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setMenuAnchor(e.currentTarget);
            }}
          >
            <MoreVert fontSize="small" />
          </IconButton>
        )}
        {hasChildren ? (
          <IconButton
            size="small"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            {...rowAction(() => setExpanded((prev) => !prev))}
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        ) : (
          // Keeps names/actions aligned between rows with and without children
          <Box sx={{ width: 34, flexShrink: 0 }} />
        )}
      </ListItemButton>
      {/* Rendered outside the ListItemButton: React events bubble through
          portals along the component tree, so menu clicks placed inside it
          would also select the row. */}
      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={menuAction(() => setOpen(true))}>
          <ListItemIcon>
            <AddBox fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText>Add child location</ListItemText>
        </MenuItem>
        <MenuItem onClick={menuAction(() => setOpenEdit(true))}>
          <ListItemIcon>
            <Edit fontSize="small" color="info" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={menuAction(() => onPrint([{ id: location.id, path }]))}>
          <ListItemIcon>
            <Print fontSize="small" color="success" />
          </ListItemIcon>
          <ListItemText>Print label</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={menuAction(() =>
            onRequestDelete({ id: String(location.id), name: location.name })
          )}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          {/* dense must be repeated — each List resets it for its own children */}
          <List component="div" disablePadding dense>
            {location.children.map((l) => (
              <LocationRow
                key={l.id}
                location={l}
                parent={location}
                path={[...path, l.name]}
                depth={depth + 1}
                selectedLocation={selectedLocation}
                setSelectedLocation={setSelectedLocation}
                canEdit={canEdit}
                onRequestDelete={onRequestDelete}
                onPrint={onPrint}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

type LocationTreeProps = {
  // The selected location's id, or '' for all locations
  selectedLocation: string;
  onSelect: (id: string) => void;
  // After a location is deleted, so the page can drop it if selected
  onDeleted: (id: string) => void;
  // The "add root location" dialog, opened from the page header
  addRootOpen: boolean;
  setAddRootOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

// The location tree panel: pick a location (or all of them), and, for
// Stockroom and up, each row's menu to add a child, edit, print or delete.
// Below md (phones, a narrow window) it sits above the grid instead of
// beside it, and folds into one row showing the selected location.
export const LocationTree = ({
  selectedLocation,
  onSelect,
  onDeleted,
  addRootOpen,
  setAddRootOpen,
}: LocationTreeProps) => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');
  const qc = useQueryClient();

  const stacked = useMediaQuery((theme) => theme.breakpoints.down('md'));
  // Starts folded when opened at a location (a scan, a link)
  const [treeOpen, setTreeOpen] = useState(!selectedLocation);
  const select = (id: string) => {
    onSelect(id);
    // Stacked, fold the tree away so the location's containers are in view
    if (stacked) setTreeOpen(false);
  };

  const {
    data: locations,
    isPending,
    isError,
    error,
  } = useQuery({ queryKey: locationKeys.list(), queryFn: getLocations });
  const { data: locationMenu } = useQuery({
    queryKey: locationKeys.menu(),
    queryFn: getLocationMenu,
    enabled: stacked,
  });
  const selectedPath = selectedLocation
    ? (locationMenu?.find((l) => String(l.id) === selectedLocation)?.full_path ?? '…')
    : 'All locations';

  // Lifted above the recursive tree (rather than one mutation per row) —
  // one print at a time, one snackbar to show its result, regardless of
  // which row triggered it. See PrintResultSnackbar for why it can watch
  // this mutation directly with no onSuccess/onError here.
  const printMutation = useMutation({
    mutationFn: printLocationLabels,
    // A print attempt is the one place in the app where the printer's own
    // hardware state (media, errors) is guaranteed to have just changed —
    // refetch the nav bar's status indicator instead of waiting for its poll.
    onSettled: () => qc.invalidateQueries({ queryKey: printerKeys.status() }),
  });
  const handlePrint = (targets: LocationLabelTarget[]) => printMutation.mutate(targets);
  const printCount = printMutation.variables?.length ?? 1;

  // Which location (if any) is pending a delete confirmation, shared by
  // every row in the tree.
  const deleteConfirm = useConfirmDialog<{ id: string; name: string }>();
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: (_data, deletedId) => {
      onDeleted(deletedId);
      // .all — a deleted location also affects the menu dropdown
      qc.invalidateQueries({ queryKey: locationKeys.all });
      deleteConfirm.cancel();
    },
  });

  return (
    <>
      <ConfirmDialog
        open={deleteConfirm.isOpen}
        title="Delete location"
        message={
          deleteConfirm.target &&
          `Delete "${deleteConfirm.target.name}"? This also removes any child locations and cannot be undone.`
        }
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMutation.isPending}
        error={deleteMutation.isError ? deleteMutation.error.message : null}
        onCancel={() => {
          deleteMutation.reset();
          deleteConfirm.cancel();
        }}
        onConfirm={() => {
          if (deleteConfirm.target) deleteMutation.mutate(deleteConfirm.target.id);
        }}
      />
      <PrintResultSnackbar
        mutation={printMutation}
        label={printCount > 1 ? `${printCount} location labels` : 'Location label'}
      />
      <AddLocation
        id={''}
        open={addRootOpen}
        setOpen={setAddRootOpen}
        onCreated={(created, print) => {
          if (print) handlePrint(created.map((c) => ({ id: c.id, path: [c.name] })));
        }}
      />
      {/* Same elevation as DataTable's default, so both panels share a
          surface color in dark mode */}
      <Paper
        elevation={4}
        sx={{
          flexShrink: 0,
          width: { xs: '100%', md: 360 },
          maxWidth: { md: 500 },
          height: { md: '75dvh' },
          maxHeight: { xs: '50dvh', md: 'none' },
          overflowY: 'auto',
        }}
      >
        {isError && (
          <Alert severity="error" sx={{ m: 1 }}>
            {error instanceof Error ? error.message : 'Failed to load locations.'}
          </Alert>
        )}
        {stacked && (
          <ListItemButton
            onClick={() => setTreeOpen((prev) => !prev)}
            aria-expanded={treeOpen}
            // The Paper's colour, and in dark mode its elevation overlay too
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              backgroundColor: 'inherit',
              backgroundImage: 'inherit',
            }}
          >
            <ListItemText secondary="Location" primary={selectedPath} />
            {treeOpen ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
        )}
        <Collapse in={!stacked || treeOpen}>
          {isPending ? (
            <CircularProgress size={24} sx={{ m: 2 }} />
          ) : (
            <List component="nav" dense>
              {/* Explicit way back to the unfiltered container list */}
              <ListItemButton selected={selectedLocation === ''} onClick={() => select('')}>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Inventory />
                </ListItemIcon>
                <ListItemText primary="All locations" />
              </ListItemButton>
              {locations?.map((l) => (
                <LocationRow
                  location={l}
                  key={l.id}
                  path={[l.name]}
                  selectedLocation={selectedLocation}
                  setSelectedLocation={select}
                  canEdit={canEdit}
                  onRequestDelete={deleteConfirm.request}
                  onPrint={handlePrint}
                />
              ))}
            </List>
          )}
        </Collapse>
      </Paper>
    </>
  );
};
