import type {
  ErrorResponse,
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

/**
 * Why a request failed, when it failed before there was a response.
 *
 * A bare `TypeError` from fetch is all the browser gives us. It used to name
 * two causes -- the API being down, and this origin missing from a CORS
 * allowlist -- and the second one no longer exists: the app and the API share
 * one origin, so there is no cross-origin request to refuse. Naming it now
 * would send someone hunting for a file that was deleted.
 *
 * What is left is worth saying precisely, because on a serverless deployment
 * the most likely cause is not a broken server at all.
 */
function networkError(path: string): ApiError {
  return new ApiError(
    'NETWORK_ERROR',
    `Could not reach ${API_BASE}${path}. The deployment may be starting up, ` +
      'or the connection may have dropped. Try again in a moment.',
  );
}

/** A response the server did answer, but not with success. */
async function failure(path: string, response: Response): Promise<ApiError> {
  // The body is the API's ErrorResponse on every route it owns. It may not be
  // one for a path no route matched, which the platform answers itself, so the
  // status is the fallback rather than an assumption.
  const body = (await response.json().catch(() => null)) as ErrorResponse | null;
  return new ApiError(
    body?.code ?? 'UNKNOWN_ERROR',
    body?.message ?? `Request to ${path} failed with ${response.status}.`,
    body?.field,
  );
}

/**
 * One request path for both verbs.
 *
 * `get` and `post` differed only in the fetch init and were otherwise the same
 * fourteen lines twice -- including the error message, byte for byte, which is
 * how it came to describe a CORS allowlist in two places after CORS was gone.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw networkError(path);
  }

  if (!response.ok) throw await failure(path, response);

  return (await response.json()) as T;
}

const get = <T>(path: string): Promise<T> => request<T>(path);

const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });


/**
 * Portraits are static files in the web app's own public/ folder, committed
 * since 2026-09-18 so a clone deploys with its artwork. A card with no portrait
 * is a 404 and the component falls back to initials.
 *
 * Keyed by CARD id, which is the costume. Over half of all characters have more
 * than one, and a costume carries its own unique skill -- the green spark printed
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

/**
 * Which extract the server is serving right now.
 *
 * 440 bytes and CDN-cached for a minute, which is why the restored-roster check
 * uses this rather than /roster/trainees: it needs one field, not 10 KB of
 * trainee list it already has in hand.
 */
export const fetchMasterMeta = (): Promise<{ masterHash: string }> =>
  get<{ masterHash: string }>('/master/meta');

/** Every trainable card. Master data, so it does not depend on the save. */

export const fetchTrainees = (): Promise<{ trainees: TraineeOption[]; masterHash: string }> =>
  get<{ trainees: TraineeOption[]; masterHash: string }>('/roster/trainees');

/*
 * `explainPair` USED TO LIVE HERE and is gone as of T16. The pair is explained
 * in this tab now -- `lineage/explain-local.ts` -- from the game data the page
 * already downloads for the search, at 0.375 ms against this route's measured
 * 35.3 ms and with byte-identical output.
 *
 * `POST /affinity/explain-pair` itself is UNCHANGED and still served. It is
 * what the golden fixtures are generated and checked through, and release 2
 * needs a server regardless, since uma.moe authenticates with a key that cannot
 * ship to a browser. What was deleted is a client wrapper with no callers, not
 * the reference implementation.
 */
