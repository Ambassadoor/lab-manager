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

//Fetch wrapper to add auth tokens, cookies, etc with error and json parsing. 
//TODO: Need to add more extensive error handling
//TODO: Need to decide on a unified error response shape for server responses
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
    if (res.status === 422) {
      return (await res.json()) as T;
    } else if (res.status === 404) {
      throw data('Not Found', { status: 404 });
    } else if (res.status === 400) {
      const message = await res.json();
      throw new Error(message.detail);
    }
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  // 204 No Content has no body to parse.
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
