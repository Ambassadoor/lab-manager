import {
  AppBar,
  Avatar,
  Box,
  Button,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useState, type JSX } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Logout } from '@mui/icons-material';
import { DarkModeToggle } from './DarkModeToggle';
import { Outlet, useNavigate } from 'react-router-dom';

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

  const navigate = useNavigate();

  if (loading) return null;

  return (
    <Paper>
      <Box sx={{ flexGrow: 1, marginBottom: 5 }}>
        <AppBar position="static">
          <Toolbar>
            <IconButton size="large" edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Lab Manager
            </Typography>
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
      </Box>
      <Outlet />
    </Paper>
  );
};
