import { AppBar, Box, Button, IconButton, Toolbar, Typography} from "@mui/material"
import MenuIcon from "@mui/icons-material/Menu"
import { type JSX } from "react"
import { useAuth } from "../../context/AuthContext";
import { AccountCircle } from "@mui/icons-material";
import { DarkModeToggle } from "./DarkModeToggle";
import { Outlet } from "react-router-dom";


export const Navbar = (): JSX.Element | null => {
  const { user, loading } = useAuth();

    if (loading) return null

    return (
        <Box>
            <Box sx={{flexGrow: 1}}>
                <AppBar position="static">
                    <Toolbar>
                        <IconButton
                            size="large"
                            edge="start"
                            color="inherit"
                            aria-label="menu"
                            sx={{ mr: 2}}
                        >
                            <MenuIcon />
                        </IconButton>
                        <Typography variant="h6" component="div" sx={{flexGrow: 1}}>
                            Lab Manager
                        </Typography>
                        <DarkModeToggle />
                        { !user
                        ? <Button color="inherit">Login</Button>
                        : <IconButton
                            size="large"
                            edge="end"
                            aria-label="profile"
                            sx={{color: "white"}}
                        >
                            <AccountCircle />
                        </IconButton>
                        }
                    </Toolbar>
                </AppBar>
            </Box>
            <Outlet />
        </Box>
    )
}