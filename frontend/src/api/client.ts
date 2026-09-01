// Base fetch wrapper for the Django API.
//
// Uses SESSION authentication: the browser sends the session cookie
// automatically (credentials: 'include'), and we attach Django's CSRF
// token on unsafe requests. No tokens are stored in JavaScript.
import { data } from 'react-router-dom';
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export type FieldErrors = Record<string, string>;

function firstMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value.map(String).join(' ');
  return undefined;
}

// Best-effort flatten of a plain {field: "msg" | ["msg", ...]} object into
// {field: "msg"} — the shape DRF's default serializer validation errors use
// (e.g. RegisterView's 400 body).
function flattenFieldErrors(body: Record<string, unknown>): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const [key, value] of Object.entries(body)) {
    const message = firstMessage(value);
    if (message) fieldErrors[key] = message;
  }
  return fieldErrors;
}

// One shape every non-2xx response throws, except 404 (see apiFetch below).
//
// - `message` (inherited from Error) is always a human-readable string,
//   suitable to show directly.
// - `fieldErrors` is a best-effort flatten of per-field validation errors,
//   for endpoints that return a raw {field: [...]} body.
// - `body` is the raw parsed response body, for callers with
//   endpoint-specific knowledge of a shape this generic parsing doesn't
//   cover (e.g. ValidateView's {"errors": {...}} wrapper).
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly fieldErrors?: FieldErrors;

  constructor(status: number, statusText: string, body: unknown) {
    let message: string | undefined;
    let fieldErrors: FieldErrors | undefined;

    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if ('detail' in record) {
        // DRF's own convention for permission/auth errors, and several
        // custom inventory views (transfer/move/weigh_in_bulk) — usually a
        // string, but LocationView.move can also send a Django
        // ValidationError's message_dict here as a nested object.
        const { detail } = record;
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = firstMessage(detail);
        } else if (detail && typeof detail === 'object') {
          fieldErrors = flattenFieldErrors(detail as Record<string, unknown>);
        }
      } else {
        // No "detail" key — assume the whole body is a raw per-field
        // validation-error dict (DRF's default serializer error shape).
        fieldErrors = flattenFieldErrors(record);
      }
      if (!message && fieldErrors) {
        message = Object.values(fieldErrors)[0];
      }
    }

    super(message ?? `API error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.fieldErrors = fieldErrors;
  }
}

// Fetch wrapper to add auth tokens, cookies, etc with error and json parsing.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const csrfToken = getCookie('csrftoken');

  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(needsCsrf && csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    // 404s are surfaced through the router's own error boundary
    // (App.tsx's <ErrorBoundary>/isRouteErrorResponse), not a component's
    // own catch block, so they keep this distinct thrown shape.
    if (res.status === 404) {
      throw data('Not Found', { status: 404 });
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // No JSON body to parse (some 401/403/500 responses have none) —
      // ApiError falls back to a generic status-based message.
    }
    throw new ApiError(res.status, res.statusText, body);
  }

  // 204 No Content has no body to parse.
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
