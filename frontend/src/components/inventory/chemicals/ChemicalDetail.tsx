import {
  Card,
  CardContent,
  CardHeader,
  Container,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { getChemicalById } from '../../../api/inventory';
import { chemicalKeys } from '../../../api/queryKeys';
import { useState } from 'react';
import { Edit } from '@mui/icons-material';
import type { SDS } from '../../../types';
import { NotFound } from '../../shared/NotFound';
import { useAuth } from '../../../context/AuthContext';
import { hasRoleAtLeast } from '../../shared/roles';
import { ChemicalView } from './ChemicalView';
import { ChemicalEditForm } from './ChemicalEditForm';

// Chemical detail page: owns the data and header; the body is ChemicalView
// or, while editing, ChemicalEditForm (see ContainerDetail, same pattern).
export const ChemicalDetail = () => {
  const { user } = useAuth();
  const canEdit = hasRoleAtLeast(user, 'stockroom');

  const [editing, setEditing] = useState(false);
  const location = useLocation();
  const { chemId } = useParams();

  const seed = location.state ?? undefined;

  // Checked locally rather than via throwOnError — a missing chemical id is
  // an expected 404, not an unexpected crash, and should show the friendly
  // NotFound page rather than App.tsx's generic error page (see
  // ContainerDetail.tsx, same pattern; and client.ts, why 404 isn't special
  // any more).
  const {
    data: chemical,
    isPending,
    isError,
  } = useQuery({
    queryKey: chemicalKeys.detail(chemId ?? ''),
    queryFn: () => getChemicalById(chemId!),
    enabled: !!chemId,
    initialData: seed,
  });

  if (isError) return <NotFound />;
  if (isPending || !chemical) return null;

  return (
    <Container>
      <Card>
        <CardHeader
          title={chemical.name}
          subheader={chemical.cas}
          action={
            // Hidden while editing — the form's own Cancel covers leaving
            canEdit &&
            !editing && (
              <Tooltip title="Edit">
                <IconButton onClick={() => setEditing(true)}>
                  <Edit />
                </IconButton>
              </Tooltip>
            )
          }
        />
        <Divider />
        {editing ? (
          <ChemicalEditForm chemical={chemical} onDone={() => setEditing(false)} />
        ) : (
          <ChemicalView chemical={chemical} />
        )}
        <Divider />
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Safety Data Sheets
          </Typography>
          {chemical.sds && chemical.sds.length > 0 ? (
            <List dense disablePadding>
              {chemical.sds.map((s: SDS) => (
                <ListItemButton key={s.id} component={RouterLink} to={`/sds/${s.id}`} divider>
                  <ListItemText
                    primary={`${s.container.name} — ${s.file_name}`}
                    secondary={[
                      s.revision_date && `Rev. date ${s.revision_date}`,
                      s.revision_number != null && `Rev. # ${s.revision_number}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </ListItemButton>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No SDS on file for this chemical yet.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Container>
  );
};
