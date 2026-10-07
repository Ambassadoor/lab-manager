# Frontend

React + TypeScript single-page app, built with Vite.

## Stack
- React + TypeScript (Vite)
- React Router
- MUI (Material UI)
- TanStack Query (React Query)
- react-hook-form
- ag-grid (the data tables, through `components/shared/DataTable.tsx`)
- openapi-typescript (generates `src/types/api.ts` from the backend's `openapi.json`)
- ESLint (Vite template) + Prettier
- pnpm

## Commands
| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the dev server (http://localhost:5173) |
| `pnpm build` | Type-check, then production build |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format `src/` with Prettier |
| `pnpm format:check` | Check formatting |
| `pnpm test` | Run the unit tests (Vitest) |

Unit tests (Vitest) sit next to the code they test as `*.test.ts`, and run in CI and in the pre-push hook. So far they cover the barcode scanner logic in `src/scanner/`.

## Key files
| Path | Purpose |
|------|---------|
| `src/main.tsx` | App entry — Query client, theme and AuthProvider wired here |
| `src/App.tsx` | Every route, and `RequireRole`, which redirects away from pages a role cannot use |
| `src/api/client.ts` | Fetch wrapper for the Django API — sends the session cookie + CSRF token |
| `src/api/bridge.ts` | Separate fetch wrapper for the hardware bridge (no session or CSRF) |
| `src/api/queryKeys.ts` | TanStack Query key factory |
| `src/api/*.ts` | One module per API area: `auth`, `inventory`, `sds`, `users`, `labelTemplates`, `feedback` |
| `src/context/` | Auth state (checks the session on load) and the light/dark theme |
| `src/types/api.ts` | Generated from the backend schema by the pre-commit hook. Do not edit by hand |
| `src/types/index.ts` | Hand-written types |
| `src/scanner/` | App-wide barcode scanning: `ScannerProvider`, `useScanHandler`, and the pure, tested parsing in `scanSequence.ts`, `identify.ts`, `parseIdList.ts`. Scanner setup: `docs/Barcode-Scanner.md` |
| `src/diagnostics/` | Captures console output, failed requests and navigation for bug reports |
| `src/components/` | By area: `accounts`, `inventory`, `sds`, `labels`, `feedback`, `nav`, and `shared` for reused pieces |

Worth knowing in `src/components/shared/`:

| File | Purpose |
|------|---------|
| `roles.ts` | `hasRoleAtLeast`, a hand-kept copy of the backend's role ranks. Used to hide UI only; the server enforces |
| `ScannableFieldRow.tsx`, `parseBarcode.ts` | Barcode scanner input |
| `printTemplates.ts` | Picks a label template for the loaded tape and prints |
| `WeightField.tsx` | Weight input with a "read from scale" button |

## Env
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL of the Django API |
| `VITE_BRIDGE_URL` | Base URL of the hardware bridge |

`.env` (copied from `.env.example`) is used by `pnpm dev`. `pnpm build` uses
`.env.production`, which sets relative URLs for the Pi, where nginx serves
the app, the API and the bridge from one address. To build for anywhere
else, put the URLs in `.env.production.local`.
