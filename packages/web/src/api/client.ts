import type {
  ErrorResponse,
  ExplainPairRequest,
  ExplainRequest,
  LineageResponse,
  RosterResolveResponse,
  RosterVeteranInput,
  TraineeOption,
} from '@umalegacies/types';

/**
 * Where the API lives, relative to wherever this app is served from.
 *
 * A PATH, not an origin. The app and the API are one Vercel project on one
 * domain: a rewrite sends /api/* to the function and everything else here. Same
 * origin means no CORS, no allowlist, and no preview-URL problem -- and it means
 * a deployed app can never talk to an API built from a different commit.
 *
 * This must agree with `setGlobalPrefix` in packages/api/src/main.ts. Nothing at
 * runtime checks that, and a disagreement 404s every route while both sides look
 * correct in isolation, so `route-contract.test.ts` reads the two and fails
 * naming the drift.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export type { ErrorResponse };

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
export const portraitUrl = (cardId: number): string => `/portraits/${cardId}.png`;

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

/**
 * Resolves a slimmed roster into names, costumes and sparks.
 *
 * `veterans` has already been through `slimSave`, so it carries three public
 * fields per uma and nothing personal. Do not pass a raw save here.
 */
export const resolveRoster = (
  veterans: RosterVeteranInput[],
  masterHash?: string,
): Promise<RosterResolveResponse> =>
  post<RosterResolveResponse>(
    '/roster/resolve',
    masterHash ? { veterans, masterHash } : { veterans },
  );

/**
 * The rank badge atlas, served from the same optional cache as the portraits.
 * A miss is a 404 and the rank renders as text.
 */
export const rankAtlasUrl = (): string => '/rank-icons/Rank_tex.webp';

/** Every trainable card. Master data, so it does not depend on the save. */

export const fetchTrainees = (): Promise<{ trainees: TraineeOption[]; masterHash: string }> =>
  get<{ trainees: TraineeOption[]; masterHash: string }>('/roster/trainees');

/**
 * Explains a chosen pair.
 *
 * The client sends two three-uma packages and the SERVER composes them into six
 * positioned slots. Nothing here builds an ExplainRequest: a mis-composed one is
 * still well-formed and returns a confident, plausible, wrong total.
 */
export const explainPair = (
  request: ExplainPairRequest,
  masterHash?: string,
): Promise<LineageResponse> =>
  post<LineageResponse>(
    '/affinity/explain-pair',
    masterHash ? { ...request, masterHash } : request,
  );
