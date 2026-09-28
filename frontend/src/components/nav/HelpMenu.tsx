import { IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import { BugReportOutlined, HelpOutlined, RateReviewOutlined } from '@mui/icons-material';
import { useState, type JSX } from 'react';
import { useFeedback } from '../feedback/FeedbackContext';

// Nav bar entry point for bug reports and feedback. Shown logged in or out —
// the public pages (login, SDS) can break too, and both endpoints accept
// anonymous submissions.
export const HelpMenu = (): JSX.Element => {
  const { openBugReport, openFeedback } = useFeedback();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Help & feedback">
        <IconButton
          color="inherit"
          aria-label="Help and feedback"
          aria-controls={open ? 'help-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <HelpOutlined />
        </IconButton>
      </Tooltip>
      <Menu id="help-menu" anchorEl={anchorEl} open={open} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            openBugReport();
          }}
        >
          <ListItemIcon>
            <BugReportOutlined fontSize="small" />
          </ListItemIcon>
          Report a problem
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            openFeedback();
          }}
        >
          <ListItemIcon>
            <RateReviewOutlined fontSize="small" />
          </ListItemIcon>
          Send feedback
        </MenuItem>
      </Menu>
    </>
  );
};
