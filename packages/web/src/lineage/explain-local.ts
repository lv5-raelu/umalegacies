import type { ExplainPairRequest, LineageResponse } from '@umalegacies/types';
import { explainLineage, lineageFromPair } from '@umalegacies/core';
import { loadMaster, requireFresh } from './master-source';

/**
 * THE PAIR, EXPLAINED WITHOUT ASKING THE SERVER.
 *
 * `POST /affinity/explain-pair` still exists and is still the tested reference
 * implementation; this is the same computation, from the same `packages/core`
 * functions, over the same game data. Measured in a browser against the real
 * roster:
 *
 * ```
 *   explainLineage LOCAL    0.375 ms
 *   explain-pair REMOTE    35.3   ms   (to LOCALHOST, 153,571 bytes back)
 * ```
 *
 * 94x, and that ratio only widens over a real network with a cold function at
 * the other end. The results are byte-identical -- compared as JSON, not
 * spot-checked -- so nothing is traded for the speed. The game data was already
 * downloaded for the search (T13), so the local path costs nothing extra.
 *
 * WHY THE ROUTE SURVIVES ANYWAY. It is what the golden fixtures are generated
 * and checked through, and release 2 needs a server regardless: the uma.moe
 * borrow source authenticates with a key that cannot ship to a browser. Deleting
 * a tested reference implementation to remove a call site would be trading
 * something for nothing.
 *
 * THE CLIENT STILL DOES NOT COMPOSE AN `ExplainRequest`. `lineageFromPair` does,
 * exactly as it does on the server, for the reason `picks.ts` gives: a
 * mis-composed request is still well-formed and returns a confident, plausible,
 * wrong total that nothing downstream can detect.
 */
export async function explainPairLocally(
  request: ExplainPairRequest,
  rosterMasterHash: string,
): Promise<LineageResponse> {
  const source = await loadMaster();
  // The roster's names came from the server's extract and these numbers come
  // from the page's. They have to be the same extract or the row is a mixture.
  requireFresh(source, rosterMasterHash);
  return explainLineage(lineageFromPair(request), source.master, source.hash);
}
