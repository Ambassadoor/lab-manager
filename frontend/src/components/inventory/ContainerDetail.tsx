import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getContainerDetails } from '../../api/inventory';
import { containerKeys, printerKeys } from '../../api/queryKeys';
import type { Container } from '../../types';
import { Close, Edit, MoreVert, Print, UnfoldMore, UploadFile } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WeighInTable } from './WeighinTable';
import { NotFound } from '../shared/NotFound';
import { useAuth } from '../../context/AuthContext';
import { hasRoleAtLeast } from '../shared/roles';
import { SdsUploadDialog } from '../sds/SdsUploadDialog';
import { PendingResultSnackbar } from '../shared/PendingResultSnackbar';
import { PrintResultSnackbar } from '../shared/PrintResultSnackbar';
import { printContainerLabel } from '../shared/printTemplates';
import { ContainerView } from './ContainerView';
import { ContainerEditForm } from './ContainerEditForm';

type ContainerDetailProps = {
  data?: Container;
  onClose?: () => void;
  // Overrides the card's default look (outlined when given `data`, as in the
  // Containers drawer) — e.g. to match elevated sibling panels on Locations.
  elevation?: number;
};

// Container detail card: the routed full page (/inventory/containers/:id),
// or — given `data` — the Containers drawer / Locations preview. Owns the
// data, header and actions menu; the body is ContainerView or, while
// editing, ContainerEditForm.
export const ContainerDetail = ({ data, onClose, elevation }: ContainerDetailProps) => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const location = useLocation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [sdsDialogOpen, setSdsDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Close the menu before running the action, same as Locations.tsx's row menu
  const menuAction = (fn: () => void) => () => {
    setMenuAnchor(null);
    fn();
  };
  const params = useParams();

  const seed: Container | undefined = data ?? location.state ?? undefined;

  // `seed` (drawer/preview row data, or router state) renders immediately as
  // initialData; the query stays enabled for those views too so an edit's
  // invalidation actually refetches, instead of leaving the panel showing
  // the pre-edit values.
  const slug = params.id ?? seed?.slug;
  const {
    data: container,
    isPending,
    isError,
  } = useQuery({
    queryKey: containerKeys.detail(slug ?? ''),
    queryFn: () => getContainerDetails(slug!),
    enabled: !!slug,
    initialData: seed,
  });

  const queryClient = useQueryClient();

  const printMutation = useMutation({
    mutationFn: printContainerLabel,
    // The one place here the printer's own hardware state (media, errors)
    // is guaranteed to have just changed — refetch the nav bar's status
    // indicator instead of waiting on its own poll interval.
    onSettled: () => queryClient.invalidateQueries({ queryKey: printerKeys.status() }),
  });

  // A 404 (bad :id in the URL) lands in this query's own error state —
  // TanStack Query doesn't propagate query errors to the router's
  // ErrorBoundary on its own (no throwOnError configured) — so it has to be
  // checked here rather than relying on App.tsx's error page.
  if (isError) return <NotFound />;
  if (isPending || !container) return null;

  const checkedOut = container.checkout_status?.action === 'out';

  return (
    <>
      {/* Only the routed (:id) view, not the Containers.tsx drawer — an
          already-open drawer for an unrelated container shouldn't show a
          toast meant for whichever container ContainerForm just created.
          See pendingActionResult.ts for why this can't just be a normal
          local Snackbar here. */}
      {!onClose && <PendingResultSnackbar />}
      <PrintResultSnackbar mutation={printMutation} label="Container label" />
      {canEdit && (
        <SdsUploadDialog
          open={sdsDialogOpen}
          setOpen={setSdsDialogOpen}
          containerId={container.id}
          chemicalId={container.chemical}
          manufacturer={container.manufacturer}
          productNum={container.product_num}
        />
      )}
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Card
          sx={{ width: `${data ? '25dvw' : '50dvw'}`, alignSelf: 'center' }}
          variant={data && elevation === undefined ? 'outlined' : 'elevation'}
          elevation={elevation ?? (data ? 0 : 4)}
        >
          {/* Header stays the same in view and edit mode (the Name field
              lives in the edit form) so the card doesn't jump on toggle */}
          <CardHeader
            title={container.name}
            subheader={
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}
              >
                <span>{container.label}</span>
                <Chip
                  size="small"
                  color={checkedOut ? 'warning' : 'success'}
                  label={
                    checkedOut
                      ? `Checked out by ${container.checkout_status?.user.full_name}`
                      : 'Available'
                  }
                />
              </Stack>
            }
            action={
              <Box>
                {(data || canEdit) && (
                  <Tooltip title="Actions">
                    <IconButton
                      aria-haspopup="menu"
                      onClick={(e) => setMenuAnchor(e.currentTarget)}
                    >
                      <MoreVert />
                    </IconButton>
                  </Tooltip>
                )}
                <Menu
                  anchorEl={menuAnchor}
                  open={menuAnchor !== null}
                  onClose={() => setMenuAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                  {data && (
                    <MenuItem
                      // Absolute — this panel is also embedded on the
                      // Locations page, where a relative path breaks
                      onClick={menuAction(() =>
                        navigate(`/inventory/containers/${data.slug}`, { state: data })
                      )}
                    >
                      <ListItemIcon>
                        <UnfoldMore fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Open full page</ListItemText>
                    </MenuItem>
                  )}
                  {/* Hidden while editing — the form's own Cancel covers leaving */}
                  {canEdit && !editing && (
                    <MenuItem onClick={menuAction(() => setEditing(true))}>
                      <ListItemIcon>
                        <Edit fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText>Edit</ListItemText>
                    </MenuItem>
                  )}
                  {canEdit && (
                    <MenuItem onClick={menuAction(() => printMutation.mutate(container))}>
                      <ListItemIcon>
                        <Print fontSize="small" color="success" />
                      </ListItemIcon>
                      <ListItemText>Print label</ListItemText>
                    </MenuItem>
                  )}
                  {canEdit && (
                    <MenuItem onClick={menuAction(() => setSdsDialogOpen(true))}>
                      <ListItemIcon>
                        <UploadFile fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>
                        {container.latest_sds ? 'Upload new SDS revision' : 'Upload SDS'}
                      </ListItemText>
                    </MenuItem>
                  )}
                </Menu>
                {onClose && (
                  <Tooltip title="Close">
                    <IconButton onClick={onClose}>
                      <Close />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            }
          />
          <Divider />
          {editing ? (
            <ContainerEditForm container={container} onDone={() => setEditing(false)} />
          ) : (
            <ContainerView container={container} showCurrentWeight={!!data} />
          )}
          {/* Full page only — always shown rather than behind an expander,
              since the page has the room for it */}
          {!data && !editing && (
            <>
              <Divider />
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Weigh-in history
                </Typography>
                <WeighInTable slug={container.slug} />
              </CardContent>
            </>
          )}
        </Card>
      </Box>
    </>
  );
};
