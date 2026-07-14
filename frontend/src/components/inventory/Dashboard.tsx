import { EventBusy, Inventory2, Logout, WarningAmber } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Container,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { getDashboard } from '../../api/inventory';
import { dashboardKeys } from '../../api/queryKeys';
import type { Container as ContainerType } from '../../types';

const EmptyState = ({ label }: { label: string }) => (
  <ListItem>
    <ListItemText
      primary={label}
      slotProps={{ primary: { color: 'text.secondary', sx: { fontStyle: 'italic' } } }}
    />
  </ListItem>
);

type DashboardSectionProps = {
  title: string;
  icon: React.ReactNode;
  color: 'primary' | 'warning' | 'info';
  items: ContainerType[];
  emptyLabel: string;
  secondary: (c: ContainerType) => string;
  loading: boolean;
};

const DashboardSection = ({
  title,
  icon,
  color,
  items,
  emptyLabel,
  secondary,
  loading,
}: DashboardSectionProps) => {
  const navigate = useNavigate();

  return (
    <Card
      elevation={2}
      sx={{ flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column' }}
    >
      <CardHeader
        avatar={<Avatar sx={{ bgcolor: `${color}.main` }}>{icon}</Avatar>}
        title={title}
        action={
          loading ? (
            <Skeleton variant="rounded" width={28} height={24} sx={{ mt: 1, mr: 1 }} />
          ) : (
            <Chip label={items.length} color={color} size="small" sx={{ mt: 1, mr: 1 }} />
          )
        }
      />
      <CardContent sx={{ flexGrow: 1 }}>
        {/* TODO: add a "View More" button here that navigates to an expanded view of this list */}
        <List disablePadding>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <ListItem key={i} disableGutters>
                <ListItemText
                  primary={<Skeleton width="60%" />}
                  secondary={<Skeleton width="40%" />}
                />
              </ListItem>
            ))
          ) : items.length > 0 ? (
            items.map((c) => (
              <ListItemButton
                key={c.id}
                disableGutters
                onClick={() => navigate(`/inventory/containers/${c.slug}`, { state: c })}
              >
                <ListItemText primary={c.name} secondary={secondary(c)} />
              </ListItemButton>
            ))
          ) : (
            <EmptyState label={emptyLabel} />
          )}
        </List>
      </CardContent>
    </Card>
  );
};

export const Dashboard = () => {
  const {
    data: { recently_added = [], restock_soon = [], checked_out = [] } = {},
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: dashboardKeys.all,
    queryFn: getDashboard,
  });

  return (
    <Container sx={{ py: 2 }}>
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load dashboard data.'}
        </Alert>
      )}
      <Stack direction={'row'} useFlexGap spacing={2} sx={{ flexWrap: 'wrap' }}>
        <DashboardSection
          title="Recently Added"
          icon={<Inventory2 />}
          color="primary"
          items={recently_added}
          emptyLabel="No recently added containers"
          loading={isLoading}
          secondary={(c) =>
            `${c.label}${c.date_received ? ` · ${dayjs(c.date_received).format('MMM D, YYYY')}` : ''}`
          }
        />
        <DashboardSection
          title="Restock Soon"
          icon={<WarningAmber />}
          color="warning"
          items={restock_soon}
          emptyLabel="Nothing running low"
          loading={isLoading}
          secondary={(c) => `${c.label} · ${c.percent_remaining}% remaining`}
        />
        <DashboardSection
          title="Checked Out"
          icon={<Logout />}
          color="info"
          items={checked_out}
          emptyLabel="Nothing checked out"
          loading={isLoading}
          secondary={(c) =>
            `${c.label}${c.checkout_status ? ` · by ${c.checkout_status.user.full_name}` : ''}`
          }
        />
        <Card elevation={2} sx={{ flex: '1 1 300px', minWidth: 280, opacity: 0.6 }}>
          <CardHeader
            avatar={
              <Avatar sx={{ bgcolor: 'grey.500' }}>
                <EventBusy />
              </Avatar>
            }
            title="Expired"
          />
          <CardContent>
            <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Coming soon
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
};
