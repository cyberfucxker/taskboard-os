/**
 * Fetch wrapper for the TaskBoard CRM backend (`/api/crm/*`, served by this same Next.js app).
 * Auth is the NextAuth cookie session: requests go same-origin with cookies and carry no
 * Authorization header. A 401 means the TaskBoard session is gone, so the browser is sent to /login.
 */
const BASE_URL = '/api/crm';

/** TaskBoard serves stored uploads (`/uploads/...`) from its own origin. */
export const FILE_BASE_URL = '';

/** Turns a stored root-relative upload path into a URL the browser can load. */
export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return path.startsWith('/uploads/') ? `${FILE_BASE_URL}${path}` : path;
}

/** Raised on a 401 so callers can tell a signed-out session from an ordinary failure. */
export class UnauthorizedError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

type UnauthorizedListener = (reason: string) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * The backend returns `{ error: "..." }` on admin routes and `{ error: { code, message } }`
 * on app routes; both are unwrapped to a plain message here so call sites never branch.
 */
function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
  }
  return `Request failed (${status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      // FormData must set its own multipart boundary, so Content-Type is left off for it.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    const parsed = messageFrom(body, 401);
    const reason = parsed === 'Request failed (401)' ? 'Your session has expired. Please sign in again.' : parsed;
    unauthorizedListeners.forEach((listener) => listener(reason));
    if (typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?callbackUrl=${next}`;
    }
    throw new UnauthorizedError(reason);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(messageFrom(body, res.status));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const body = (value: unknown) => (value === undefined ? undefined : JSON.stringify(value));

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: body(data) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: body(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: body(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Multipart upload — used by the CRM file pickers. */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

/** Builds a `?a=1&b=2` query string, skipping undefined/null/empty values. */
export function toQueryString(params: Record<string, unknown>): string {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (usable.length === 0) return '';
  return `?${new URLSearchParams(usable.map(([k, v]) => [k, String(v)])).toString()}`;
}

/**
 * Uploads files and returns their stored paths. Every image/PDF picker in the admin panel
 * routes through here, so none of them needs its own multipart handling.
 */
export async function uploadFiles(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  const form = new FormData();
  for (const file of files) form.append('files', file);
  const { urls } = await api.upload<{ urls: string[] }>('/uploads', form);
  return urls;
}

