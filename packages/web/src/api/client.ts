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

export interface MasterMeta {
  masterHash: string;
  tables: Record<string, number>;
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
  } catch (cause) {
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

export const fetchMasterMeta = (): Promise<MasterMeta> =>
  get<MasterMeta>('/master/meta');

export const fetchFixtureNames = (): Promise<{ names: string[] }> =>
  get<{ names: string[] }>('/affinity/fixtures');

export const fetchFixture = (name: string): Promise<FixtureSummary> =>
  get<FixtureSummary>(`/affinity/fixtures/${encodeURIComponent(name)}`);

export const explainLineage = (request: ExplainRequest): Promise<LineageResponse> =>
  post<LineageResponse>('/affinity/explain', request);
