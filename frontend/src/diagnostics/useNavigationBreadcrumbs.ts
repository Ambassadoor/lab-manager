import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { record } from './buffer';

// Records each route change so a report shows the path the user took to the
// bug. Must be called from a component rendered inside the router — Navbar,
// the root route's element, which stays mounted for every page.
export function useNavigationBreadcrumbs(): void {
  const { pathname, search } = useLocation();
  useEffect(() => {
    record('nav', 'info', `Navigated to ${pathname}${search}`);
  }, [pathname, search]);
}
