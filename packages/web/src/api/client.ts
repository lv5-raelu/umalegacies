import type { ExplainRequest, FixtureSummary, LineageResponse } from './types';

/**
 * The API base URL. The API's CORS allowlist is explicit and must contain the
 * origin this app is served from; see the README gotcha.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

/** Mirrors the API's ErrorResponse. Kept narrow until a shared types package earns its keep. */
export interface ErrorResponse {
  code: string;
  message: string;
  field?: string;
}

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly field?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch {
    // A CORS rejection and a dead server both land here as a bare TypeError,
    // so say both out loud rather than guessing.
    throw new ApiError(
      'NETWORK_ERROR',
      `Could not reach the API at ${API_BASE}. It may be down, or this origin ` +
        `(${window.location.origin}) may not be on its CORS allowlist.`,
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(
      body?.code ?? 'UNKNOWN_ERROR',
      body?.message ?? `Request to ${path} failed with ${response.status}.`,
      body?.field,
    );
  }

  return (await response.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      `Could not reach the API at ${API_BASE}. It may be down, or this origin ` +
        `(${window.location.origin}) may not be on its CORS allowlist.`,
    );
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request to ${path} failed with ${response.status}.`,
      error?.field,
    );
  }

  return (await response.json()) as T;
}

/**
 * Portraits are served by the API, not from the web app's own public/ folder,
 * because the cache they come from is a gitignored directory beside the master
 * extract. A miss is a 404 and the component falls back to initials.
 *
 * Keyed by CARD id, which is the costume. 35 of 66 characters have more than
 * one, and a costume carries its own unique skill -- the green spark printed
 * directly under this image.
 */
export const portraitUrl = (cardId: number): string =>
  `${API_BASE}/portraits/${cardId}.png`;

export const fetchFixtureNames = (): Promise<{ names: string[] }> =>
  get<{ names: string[] }>('/affinity/fixtures');

export const fetchFixture = (name: string): Promise<FixtureSummary> =>
  get<FixtureSummary>(`/affinity/fixtures/${encodeURIComponent(name)}`);

/**
 * `masterHash` pins the request to a specific extract. If the server is serving
 * a different one -- a game patch landed and the extract was rebuilt while this
 * tab was open -- it answers 409 STALE_MASTER_HASH instead of handing back
 * numbers computed from different game data.
 */
export const explainLineage = (
  request: ExplainRequest,
  masterHash?: string,
): Promise<LineageResponse> =>
  post<LineageResponse>('/affinity/explain', masterHash ? { ...request, masterHash } : request);
