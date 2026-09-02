import {
  AppBar,
  Avatar,
  Box,
  Button,
  ClickAwayListener,
  Divider,
  Drawer,
  Grow,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import { useState, type JSX } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Logout } from '@mui/icons-material';
import { DarkModeToggle } from './DarkModeToggle';
import { Link, NavLink, Outlet, useNavigate, useNavigation } from 'react-router-dom';
import { hasRoleAtLeast } from '../shared/roles';

// Shared by every top-level nav link, desktop and mobile — was copy-pasted
// four times before (once per Button); the theme-callback form here means
// it doesn't need a `theme` variable from useTheme() in scope.
const navLinkSx = {
  '&.active': {
    textDecorationLine: 'underline',
    textDecorationColor: (theme: Theme) => theme.palette.secondary.main,
    textDecorationThickness: 2,
    textUnderlineOffset: 5,
  },
};

const actionTabs = [
  { label: 'Check Out', tab: 0 },
  { label: 'Check In', tab: 1 },
  { label: 'Move Containers', tab: 2 },
  { label: 'Move Locations', tab: 3 },
];

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

  // Mobile nav drawer — swaps in for the horizontal button row below the
  // `sm` breakpoint (see the two Box sx={{ display: {...} }} wrappers below).
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = () => setMobileOpen(false);

  const navigate = useNavigate();
  const navigation = useNavigation();

  if (loading) return null;

  return (
    <Paper sx={{ height: '100dvh', width: '100dvw', overflow: 'auto' }} square>
      <Box sx={{ flexGrow: 1, marginBottom: 5 }}>
        <AppBar position="static">
          <Toolbar>
            {user && (
              <IconButton
                size="large"
                edge="start"
                color="inherit"
                aria-label="menu"
                sx={{ mr: 2, display: { xs: 'inline-flex', sm: 'none' } }}
                onClick={() => setMobileOpen((prev) => !prev)}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Typography
              variant="h6"
              component={Link}
              to="/"
              sx={{ textDecoration: 'none', color: 'inherit' }}
            >
              Lab Manager
            </Typography>
            <Box sx={{ flexGrow: 1, pl: 4, display: { xs: 'none', sm: 'block' } }}>
              {user && (
                <Stack spacing={2} direction={'row'}>
                  <Button
                    component={NavLink}
                    to="/inventory/containers/"
                    color="inherit"
                    sx={navLinkSx}
                    end
                  >
                    Containers
                  </Button>
                  {hasRoleAtLeast(user, 'stockroom') && (
                    <>
                      <Button
                        component={NavLink}
                        to="/inventory/containers/new/"
                        color="inherit"
                        sx={navLinkSx}
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
                          sx={navLinkSx}
                          aria-controls={actionsMenuOpen ? 'actions-menu' : undefined}
                          aria-haspopup="true"
                          aria-expanded={actionsMenuOpen}
                          end
                        >
                          Actions
                        </Button>
                        <Popper
                          id="actions-menu"
                          anchorEl={actionsMenuEl}
                          open={actionsMenuOpen}
                          placement="bottom-start"
                          transition
                          sx={{ zIndex: (theme) => theme.zIndex.appBar + 1 }}
                        >
                          {({ TransitionProps }) => (
                            <Grow {...TransitionProps}>
                              <Paper onMouseLeave={handleActionsMenuClose}>
                                <ClickAwayListener onClickAway={handleActionsMenuClose}>
                                  <MenuList autoFocusItem={false}>
                                    {actionTabs.map(({ label, tab }) => (
                                      <MenuItem
                                        key={tab}
                                        component={Link}
                                        to={`/inventory/containers/actions/?tab=${tab}`}
                                        onClick={handleActionsMenuClose}
                                      >
                                        {label}
                                      </MenuItem>
                                    ))}
                                  </MenuList>
                                </ClickAwayListener>
                              </Paper>
                            </Grow>
                          )}
                        </Popper>
                      </Box>
                    </>
                  )}
                  <Button
                    component={NavLink}
                    to="/inventory/locations/"
                    color="inherit"
                    sx={navLinkSx}
                    end
                  >
                    Locations
                  </Button>
                  <Button
                    component={NavLink}
                    to="/inventory/chemicals"
                    color="inherit"
                    sx={navLinkSx}
                    end
                  >
                    Chemicals
                  </Button>
                  {hasRoleAtLeast(user, 'lab_manager') && (
                    <Button component={NavLink} to="/users/" color="inherit" sx={navLinkSx} end>
                      Users
                    </Button>
                  )}
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
                  <MenuItem
                    onClick={() => {
                      navigate('/profile');
                      handleCloseUserMenu();
                    }}
                  >
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
      {user && (
        <Drawer
          anchor="left"
          open={mobileOpen}
          onClose={closeMobileMenu}
          sx={{ display: { xs: 'block', sm: 'none' } }}
        >
          <Box sx={{ width: 260 }} role="presentation">
            <List>
              <ListItemButton
                component={NavLink}
                to="/inventory/containers/"
                end
                sx={navLinkSx}
                onClick={closeMobileMenu}
              >
                <ListItemText primary="Containers" />
              </ListItemButton>
              {hasRoleAtLeast(user, 'stockroom') && (
                <>
                  <ListItemButton
                    component={NavLink}
                    to="/inventory/containers/new/"
                    end
                    sx={navLinkSx}
                    onClick={closeMobileMenu}
                  >
                    <ListItemText primary="Add Container" />
                  </ListItemButton>
                  {/* Actions' four destinations inline, not a further nested
                      submenu — the desktop hover-popup doesn't translate to
                      touch, and a second level of disclosure here would just
                      bury them. */}
                  <ListSubheader>Actions</ListSubheader>
                  {actionTabs.map(({ label, tab }) => (
                    <ListItemButton
                      key={tab}
                      component={Link}
                      to={`/inventory/containers/actions/?tab=${tab}`}
                      sx={{ pl: 4 }}
                      onClick={closeMobileMenu}
                    >
                      <ListItemText primary={label} />
                    </ListItemButton>
                  ))}
                  <Divider />
                </>
              )}
              <ListItemButton
                component={NavLink}
                to="/inventory/locations/"
                end
                sx={navLinkSx}
                onClick={closeMobileMenu}
              >
                <ListItemText primary="Locations" />
              </ListItemButton>
              <ListItemButton
                component={NavLink}
                to="/inventory/chemicals"
                end
                sx={navLinkSx}
                onClick={closeMobileMenu}
              >
                <ListItemText primary="Chemicals" />
              </ListItemButton>
              {hasRoleAtLeast(user, 'lab_manager') && (
                <ListItemButton
                  component={NavLink}
                  to="/users/"
                  end
                  sx={navLinkSx}
                  onClick={closeMobileMenu}
                >
                  <ListItemText primary="Users" />
                </ListItemButton>
              )}
            </List>
          </Box>
        </Drawer>
      )}
      <Outlet />
    </Paper>
  );
};
