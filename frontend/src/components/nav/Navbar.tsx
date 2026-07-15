import {
  AppBar,
  Avatar,
  Box,
  Button,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useState, type JSX } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Logout } from '@mui/icons-material';
import { DarkModeToggle } from './DarkModeToggle';
import { Link, NavLink, Outlet, useNavigate, useNavigation } from 'react-router-dom';

export const Navbar = (): JSX.Element | null => {
  const { user, loading, logout } = useAuth();
  const [userMenuEl, setUserMenuEl] = useState<null | HTMLElement>(null);
  const userMenuOpen = Boolean(userMenuEl);
  const handleUserMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuEl(event.currentTarget);
  };
  const handleCloseUserMenu = () => {
    setUserMenuEl(null);
  };

  const [actionsMenuEl, setActionsMenuEl] = useState<null | HTMLElement>(null);
  const actionsMenuOpen = Boolean(actionsMenuEl);
  const handleActionsMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setActionsMenuEl(event.currentTarget);
  };
  const handleActionsMenuClose = () => {
    setActionsMenuEl(null);
  };

  const navigate = useNavigate();
  const navigation = useNavigation();

  const theme = useTheme();

  if (loading) return null;

  //TODO: Need to add support for a mobile menu add actions to a submenu for containers
  return (
    <Paper sx={{ height: '100dvh', width: '100dvw', overflow: 'auto' }} square>
      <Box sx={{ flexGrow: 1, marginBottom: 5 }}>
        <AppBar position="static">
          <Toolbar>
            <IconButton size="large" edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              component={Link}
              to="/"
              sx={{ textDecoration: 'none', color: 'inherit' }}
            >
              Lab Manager
            </Typography>
            <Box sx={{ flexGrow: 1, pl: 4 }}>
              {user && (
                <Stack spacing={2} direction={'row'}>
                  <Button
                    component={NavLink}
                    to="/inventory/containers/"
                    color="inherit"
                    sx={{
                      '&.active': {
                        textDecorationLine: 'underline',
                        textDecorationColor: theme.palette.secondary.main,
                        textDecorationThickness: 2,
                        textUnderlineOffset: 5,
                      },
                    }}
                    end
                  >
                    Containers
                  </Button>
                  <Button
                    component={NavLink}
                    to="/inventory/containers/new/"
                    color="inherit"
                    sx={{
                      '&.active': {
                        textDecorationLine: 'underline',
                        textDecorationColor: theme.palette.secondary.main,
                        textDecorationThickness: 2,
                        textUnderlineOffset: 5,
                      },
                    }}
                    end
                  >
                    Add Container
                  </Button>
                  <Box
                    onMouseEnter={handleActionsMenuOpen}
                    onMouseLeave={handleActionsMenuClose}
                    sx={{ display: 'inline-flex' }}
                  >
                    <Button
                      component={NavLink}
                      to="/inventory/containers/actions/"
                      color="inherit"
                      sx={{
                        '&.active': {
                          textDecorationLine: 'underline',
                          textDecorationColor: theme.palette.secondary.main,
                          textDecorationThickness: 2,
                          textUnderlineOffset: 5,
                        },
                      }}
                      aria-controls={actionsMenuOpen ? 'actions-menu' : undefined}
                      aria-haspopup="true"
                      aria-expanded={actionsMenuOpen}
                      end
                    >
                      Actions
                    </Button>
                    <Menu
                      id="actions-menu"
                      anchorEl={actionsMenuEl}
                      open={actionsMenuOpen}
                      onClose={handleActionsMenuClose}
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                      disableAutoFocus
                      disableEnforceFocus
                      disableRestoreFocus
                      sx={{ pointerEvents: 'none' }}
                      slotProps={{
                        paper: {
                          onMouseLeave: handleActionsMenuClose,
                          sx: { pointerEvents: 'auto' },
                        },
                        list: { onMouseLeave: handleActionsMenuClose },
                      }}
                    >
                      <MenuItem
                        component={Link}
                        to="/inventory/containers/actions/?tab=0"
                        onClick={handleActionsMenuClose}
                      >
                        Check Out
                      </MenuItem>
                      <MenuItem
                        component={Link}
                        to="/inventory/containers/actions/?tab=1"
                        onClick={handleActionsMenuClose}
                      >
                        Check In
                      </MenuItem>
                      <MenuItem
                        component={Link}
                        to="/inventory/containers/actions/?tab=2"
                        onClick={handleActionsMenuClose}
                      >
                        Transfer Location
                      </MenuItem>
                    </Menu>
                  </Box>
                  <Button
                    component={NavLink}
                    to="/inventory/locations/"
                    color="inherit"
                    sx={{
                      '&.active': {
                        textDecorationLine: 'underline',
                        textDecorationColor: theme.palette.secondary.main,
                        textDecorationThickness: 2,
                        textUnderlineOffset: 5,
                      },
                    }}
                    end
                  >
                    Locations
                  </Button>
                  <Button
                    component={NavLink}
                    to="/inventory/chemicals"
                    color="inherit"
                    sx={{
                      '&.active': {
                        textDecorationLine: 'underline',
                        textDecorationColor: theme.palette.secondary.main,
                        textDecorationThickness: 2,
                        textUnderlineOffset: 5,
                      },
                    }}
                    end
                  >
                    Chemicals
                  </Button>
                </Stack>
              )}
            </Box>
            <DarkModeToggle />
            {!user ? (
              <Button color="inherit">Login</Button>
            ) : (
              <>
                <Tooltip title="Account settings">
                  <IconButton
                    size="large"
                    edge="end"
                    aria-controls={userMenuOpen ? 'account-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={userMenuOpen}
                    aria-label="Account Settings"
                    sx={{ color: 'white' }}
                    onClick={handleUserMenuClick}
                  >
                    <Avatar sx={{ width: 32, height: 32 }}></Avatar>
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={userMenuEl}
                  id="account-menu"
                  open={userMenuOpen}
                  onClose={handleCloseUserMenu}
                  onClick={handleCloseUserMenu}
                >
                  <MenuItem onClick={handleCloseUserMenu}>
                    <Avatar sx={{ width: 32, height: 32, ml: -0.5, mr: 1 }} /> Profile
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      logout();
                      navigate('/');
                      handleCloseUserMenu();
                    }}
                  >
                    <ListItemIcon>
                      <Logout fontSize="small" />
                    </ListItemIcon>
                    Logout
                  </MenuItem>
                </Menu>
              </>
            )}
          </Toolbar>
        </AppBar>
        {navigation.state !== 'idle' && <LinearProgress />}
      </Box>
      <Outlet />
    </Paper>
  );
};
