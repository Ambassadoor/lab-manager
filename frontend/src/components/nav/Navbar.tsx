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
  useMediaQuery,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import { useLayoutEffect, useRef, useState, type JSX } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  BugReportOutlined,
  DarkMode,
  LightMode,
  Logout,
  RateReviewOutlined,
} from '@mui/icons-material';
import { DarkModeToggle } from './DarkModeToggle';
import { useDarkModeSwitch } from './useDarkModeSwitch';
import { PrinterStatusIndicator } from './PrinterStatusIndicator';
import { HelpMenu } from './HelpMenu';
import { CameraButton } from '../../scanner/CameraButton';
import { Link, NavLink, Outlet, useNavigate, useNavigation } from 'react-router-dom';
import { hasRoleAtLeast } from '../shared/roles';
import { useNavigationBreadcrumbs } from '../../diagnostics';
import { useFeedback } from '../feedback/FeedbackContext';

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
  // Navbar is the root route's element, mounted for every page — the one
  // place a route-change hook sees all navigation (for bug-report breadcrumbs).
  useNavigationBreadcrumbs();
  const { user, loading, logout } = useAuth();
  const { openBugReport, openFeedback } = useFeedback();
  const darkMode = useDarkModeSwitch();
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

  // Nav drawer — swaps in for the horizontal row of links whenever they
  // don't fit beside the title and icons.
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobileMenu = () => setMobileOpen(false);

  // Whether the links fit. Measured rather than tied to a breakpoint: they
  // need about 820 px for a Lab Assistant and 1,360 px for a Lab Manager
  // (4 to 8 links), more when zoomed, so any fixed breakpoint is wrong for
  // someone. Before this, links that didn't fit spilled past the bar and
  // made the page scroll sideways (#86). The links row is always laid out
  // at its natural width (max-content), only hidden when it doesn't fit,
  // so it can be measured either way.
  const linksAreaRef = useRef<HTMLDivElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const [linksFit, setLinksFit] = useState(true);
  // A phone always gets the drawer: it also holds the help menu and dark
  // mode switch, which the bar has no room for there.
  const isPhone = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const showDrawer = !linksFit || isPhone;
  useLayoutEffect(() => {
    const area = linksAreaRef.current;
    const links = linksRef.current;
    if (!area || !links) return;
    const measure = () => {
      const padding = parseFloat(getComputedStyle(area).paddingLeft) || 0;
      setLinksFit(links.offsetWidth <= area.clientWidth - padding);
    };
    measure();
    // The area resizes with the window; the links change with the user's
    // role (logging in or out) and when the font finishes loading.
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(links);
    return () => observer.disconnect();
  }, [loading]);

  const navigate = useNavigate();
  const navigation = useNavigation();

  if (loading) return null;

  return (
    <Paper sx={{ height: '100dvh', width: '100%', overflow: 'auto' }} square>
      <Box sx={{ flexGrow: 1, marginBottom: { xs: 2, sm: 5 } }}>
        <AppBar position="static">
          <Toolbar>
            {/* Not gated by `user` — the mobile drawer now also carries the
                always-public "Search SDS" link, so the menu itself has to
                stay reachable while logged out too. */}
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: { xs: 1, sm: 2 }, display: showDrawer ? 'inline-flex' : 'none' }}
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              component={Link}
              to="/"
              noWrap
              sx={{ textDecoration: 'none', color: 'inherit', flexShrink: 0 }}
            >
              Lab Manager
            </Typography>
            {/* Takes the free space either way; overflow is clipped so links
                that don't fit can never widen the page. */}
            <Box ref={linksAreaRef} sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', pl: 4 }}>
              <Stack
                ref={linksRef}
                spacing={2}
                direction={'row'}
                // visibility (not display) keeps the row's width measurable,
                // and still removes it from the tab order and screen readers
                sx={{ width: 'max-content', visibility: showDrawer ? 'hidden' : 'visible' }}
              >
                {/* Always visible, logged in or out — SDS viewing is public
                    safety information (see App.tsx's /sds routes). */}
                <Button component={NavLink} to="/sds" color="inherit" sx={navLinkSx} end>
                  Search SDS
                </Button>
                {user && (
                  <>
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
                      <>
                        <Button component={NavLink} to="/users/" color="inherit" sx={navLinkSx} end>
                          Users
                        </Button>
                        <Button
                          component={NavLink}
                          to="/label-templates/"
                          color="inherit"
                          sx={navLinkSx}
                          end
                        >
                          Label Templates
                        </Button>
                      </>
                    )}
                  </>
                )}
              </Stack>
            </Box>
            {/* Logged in or out: logged out, a container scan opens its SDS */}
            <CameraButton />
            {/* Stockroom+ only — same gate as Add Container/Actions above,
                since printing labels is a stockroom-level task and the
                bridge it reports on only runs on the lab PC anyway. */}
            {user && hasRoleAtLeast(user, 'stockroom') && (
              <Box sx={{ display: 'inline-flex', mr: 2 }}>
                <PrinterStatusIndicator />
              </Box>
            )}
            {/* On a phone these move into the nav drawer, to leave the bar
                room for the title. */}
            <Box sx={{ display: { xs: 'none', sm: 'inline-flex' }, alignItems: 'center' }}>
              <HelpMenu />
              <DarkModeToggle />
            </Box>
            {!user ? (
              <Button color="inherit" component={Link} to="/login" sx={{ flexShrink: 0 }}>
                Login
              </Button>
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
      {/* Not gated by `user` — same reasoning as the menu IconButton above:
          "Search SDS" has to be reachable here while logged out too. */}
      <Drawer
        anchor="left"
        // Closes by itself if the window widens until the links fit again
        open={mobileOpen && showDrawer}
        onClose={closeMobileMenu}
      >
        <Box sx={{ width: 260 }} role="presentation">
          <List>
            <ListItemButton
              component={NavLink}
              to="/sds"
              end
              sx={navLinkSx}
              onClick={closeMobileMenu}
            >
              <ListItemText primary="Search SDS" />
            </ListItemButton>
            {user && (
              <>
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
                  <>
                    <ListItemButton
                      component={NavLink}
                      to="/users/"
                      end
                      sx={navLinkSx}
                      onClick={closeMobileMenu}
                    >
                      <ListItemText primary="Users" />
                    </ListItemButton>
                    <ListItemButton
                      component={NavLink}
                      to="/label-templates/"
                      end
                      sx={navLinkSx}
                      onClick={closeMobileMenu}
                    >
                      <ListItemText primary="Label Templates" />
                    </ListItemButton>
                  </>
                )}
              </>
            )}
          </List>
          {/* The toolbar's help menu and dark mode switch, which a phone's
              bar has no room for. */}
          <Divider />
          <List>
            <ListItemButton
              onClick={() => {
                closeMobileMenu();
                openBugReport();
              }}
            >
              <ListItemIcon>
                <BugReportOutlined />
              </ListItemIcon>
              <ListItemText primary="Report a problem" />
            </ListItemButton>
            <ListItemButton
              onClick={() => {
                closeMobileMenu();
                openFeedback();
              }}
            >
              <ListItemIcon>
                <RateReviewOutlined />
              </ListItemIcon>
              <ListItemText primary="Send feedback" />
            </ListItemButton>
            <ListItemButton onClick={darkMode.toggle}>
              <ListItemIcon>{darkMode.mode === 'dark' ? <DarkMode /> : <LightMode />}</ListItemIcon>
              <ListItemText primary={darkMode.mode === 'dark' ? 'Dark mode' : 'Light mode'} />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>
      <Outlet />
    </Paper>
  );
};
