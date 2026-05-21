# Frontend

React + TypeScript single-page app, built with Vite.

## Stack
- React + TypeScript (Vite)
- React Router
- MUI (Material UI)
- TanStack Query (React Query)
- ESLint (Vite template) + Prettier
- pnpm

## Commands
| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the dev server (http://localhost:5173) |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format `src/` with Prettier |
| `pnpm format:check` | Check formatting |

## Key files
| File | Purpose |
|------|---------|
| `src/api/client.ts` | Fetch wrapper — sends the session cookie + CSRF token |
| `src/api/auth.ts` | CSRF, login, logout, and current-user calls |
| `src/context/AuthContext.tsx` | Auth state; checks the session on load |
| `src/main.tsx` | App entry — Router, Query, AuthProvider wired here |

## Env
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL of the Django API |
